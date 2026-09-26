import {DateTime} from 'luxon';
import {join} from 'node:path';
import {readdirSync,unlinkSync} from 'node:fs';
import type {Store} from './store.ts';
import {calendarAccessToken} from './auth.ts';
import {collectGoogleEvents} from './calendar.ts';
import {config} from './config.ts';
import {calendarSources,sourceId,ensureCalendarSources,type CalendarSource} from './calendar-sources.ts';
const locks=new WeakMap<Store,Set<string>>();
export type SyncDependencies={token:(store:Store)=>Promise<string>;collect:typeof collectGoogleEvents};
const dependencies:SyncDependencies={token:calendarAccessToken,collect:collectGoogleEvents};
export async function syncCalendar(store:Store,forceFull=false,source=calendarSources()[0],deps=dependencies){
 const id=sourceId(source);const running=locks.get(store)||new Set<string>();locks.set(store,running);
 if(running.has(id))throw new Error('A calendar refresh is already running.');running.add(id);
 const old=store.sync(id);const now=new Date().toISOString();
 const state={id,label:source.label,mode:'live' as const,lastAttempt:now,lastSuccess:old?.lastSuccess||null,snapshotAt:null,error:null,count:old?.count||0,syncToken:old?.syncToken};store.setSync(state);
 try {
  const token=await deps.token(store);const result=await deps.collect(token,source.calendarId,forceFull?undefined:old?.syncToken);
  const success={...state,lastSuccess:new Date().toISOString(),syncToken:result.syncToken,count:0};
  const applied=store.apply(id,result.events,{full:result.full,state:success,contractor:source.contractor});
  store.setSync({...success,count:applied.count});if(source.key==='primary')store.setSetting('active-calendar',id);
  store.audit('calendar-sync-success',id);return applied;
 }catch(e){store.setSync({...state,error:e instanceof Error?e.message:'Calendar could not refresh'});throw e;}
 finally{running.delete(id);}
}
export async function refreshCalendars(store:Store,sources=calendarSources(),deps=dependencies){
 ensureCalendarSources(store,sources);const failures:string[]=[];let changed=0;
 let token:Promise<string>|undefined;const shared={...deps,token:()=>token??=deps.token(store)};
 for(const source of sources){try{changed+=(await syncCalendar(store,false,source,shared)).changed;}catch{failures.push(source.label);}}
 if(failures.length)throw new Error(`Some calendars could not refresh: ${failures.join(', ')}. Check their individual connection status.`);
 return {changed,calendars:sources.length};
}
async function backupSet(store:Store,directory:string,date:string){
 await store.backup(join(directory,`hub-${date}.sqlite`));
 await store.backup(join(directory,`hub-monthly-${date.slice(0,7)}.sqlite`));
 const files=readdirSync(directory);
 const daily=files.filter(n=>/^hub-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n)).sort();for(const f of daily.slice(0,-30))unlinkSync(join(directory,f));
 const monthly=files.filter(n=>/^hub-monthly-\d{4}-\d{2}\.sqlite$/.test(n)).sort();for(const f of monthly.slice(0,-12))unlinkSync(join(directory,f));
 return Math.min(daily.length,30);
}
export async function dailyBackup(store:Store,at=new Date()){
 const now=at.toISOString(),date=DateTime.fromJSDate(at).setZone('America/Vancouver').toISODate()!,prior=store.sync('backup');store.setSync({id:'backup',label:'Verified backup',mode:'live',lastAttempt:now,lastSuccess:prior?.lastSuccess||null,snapshotAt:null,error:null,count:prior?.count||0});
 try{
  const count=await backupSet(store,config.backupDir,date);
  if(config.secondaryBackupDir)await backupSet(store,config.secondaryBackupDir,date);
  store.setSync({id:'backup',label:'Verified backup',mode:'live',lastAttempt:now,lastSuccess:now,snapshotAt:null,error:null,count});
 }catch{store.setSync({id:'backup',label:'Verified backup',mode:'live',lastAttempt:now,lastSuccess:prior?.lastSuccess||null,snapshotAt:null,error:'Backup failed. Check disk space and folder access.',count:prior?.count||0});throw new Error('Backup failed');}
}
export async function scheduledTick(store:Store,sources=calendarSources(),deps=dependencies){
 const now=DateTime.now().setZone('America/Vancouver');const day=now.toISODate()!;
 ensureCalendarSources(store,sources);
 let token:Promise<string>|undefined;const shared={...deps,token:()=>token??=deps.token(store)};
 if(store.getSetting('calendar-refresh'))for(const source of sources){
  const id=sourceId(source),sync=store.sync(id);const due=!sync?.lastAttempt||Date.now()-Date.parse(sync.lastAttempt)>=3600000;
  const nightly=store.getSetting('last-nightly-'+id)!==day;
  if(due)try{await syncCalendar(store,nightly,source,shared);if(nightly)store.setSetting('last-nightly-'+id,day);}catch{/* Other calendars and the backup still run. */}
 }
 if(store.getSetting('last-backup')!==day){try{await dailyBackup(store);store.setSetting('last-backup',day);}catch{/* Failure recorded by dailyBackup. */}}
}
export function startScheduler(store:Store){let running=false;return setInterval(async()=>{if(running)return;running=true;try{await scheduledTick(store);}catch{/* Invalid configuration must not crash the server. */}finally{running=false;}},60000);}
