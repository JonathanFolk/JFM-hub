import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {config} from './config.ts';
import type {Store} from './store.ts';
export type CalendarSource={key:string;calendarId:string;label:string;contractor?:string};
export const sourceId=(s:CalendarSource)=>s.key==='primary'?'google-calendar':`google-calendar-${s.key}`;
export function validateSources(value:unknown):CalendarSource[]{
 if(!Array.isArray(value)||!value.length||value.length>20)throw new Error('Configure an explicit list of approved calendars.');
 const keys=new Set(),ids=new Set();
 for(const c of value){
  if(!c||typeof c.key!=='string'||!/^[-a-z0-9]+$/.test(c.key)||typeof c.calendarId!=='string'||!c.calendarId||typeof c.label!=='string'||!c.label||keys.has(c.key)||ids.has(c.calendarId))throw new Error('Calendar selection contains an invalid or duplicate entry.');
  if(c.key!=='primary'&&(typeof c.contractor!=='string'||!c.contractor.trim()))throw new Error('Subcontractor calendars require the For J gate.');
  if(c.key==='primary'&&c.contractor)throw new Error('Primary calendar cannot be a contractor calendar.');
  keys.add(c.key);ids.add(c.calendarId);
 }
 if(!keys.has('primary'))throw new Error('The primary booking calendar is required.');
 return [...value].sort((a,b)=>Number(b.key==='primary')-Number(a.key==='primary'));
}
export function calendarSources():CalendarSource[]{
 const path=process.env.CALENDAR_SOURCES_FILE||resolve(dirname(config.database),'calendars.json');
 const sources:CalendarSource[]=validateSources(existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[{key:'primary',calendarId:config.calendarId,label:'Jonathan Folk Calendar'}]);
 const floor=sources.find(s=>s.calendarId==='threedeelevate@gmail.com'||/3d\s*elevate/i.test(s.label));
 if(floor)floor.contractor='3D Elevate';else sources.push({key:'threedeelevate',calendarId:'threedeelevate@gmail.com',label:'3D Elevate floor plans',contractor:'3D Elevate'});
 return validateSources(sources);
}
export function ensureCalendarSources(store:Store,sources=calendarSources()){
 for(const source of sources){const id=sourceId(source);if(!store.sync(id))store.setSync({id,label:source.label,mode:'not-connected',lastAttempt:null,lastSuccess:null,snapshotAt:null,error:null,count:0});}
}
export function currentJobs(store:Store,sources=calendarSources()){
 const active=store.getSetting('active-calendar')||'calendar-export';
 const visible=new Set(sources.filter(s=>s.key!=='primary').map(sourceId));visible.add(active);
 if(config.preview)for(const sync of store.syncs())if(sync.id.startsWith('google-calendar-'))visible.add(sync.id);
 const deleted=store.deletedJobIds();return store.jobs().filter(j=>visible.has(j.source)&&!deleted.has(j.id)&&!j.supportingJobId);
}
