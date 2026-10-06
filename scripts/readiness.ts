import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {calendarSources,sourceId} from '../server/calendar-sources.ts';
import {config,validateConfig,validEncryptionKey} from '../server/config.ts';
import type {SyncState} from '../server/types.ts';

type Check={name:string;ok:boolean;detail:string};
const checks:Check[]=[];
const check=(name:string,ok:boolean,pass:string,fail:string)=>checks.push({name,ok,detail:ok?pass:fail});

try{validateConfig();checks.push({name:'Configuration',ok:true,detail:'Core production configuration is valid.'});}
catch(error){checks.push({name:'Configuration',ok:false,detail:error instanceof Error?error.message:'Configuration is invalid.'});}

check('Mode',config.mode==='production','Production mode is selected.','Set APP_MODE=production on the hosted service.');
check('Origin',config.origin.startsWith('https://'),'The public origin uses HTTPS.','Set APP_ORIGIN to the final HTTPS Hub address.');
check('Google OAuth',!!config.clientId&&!!config.clientSecret&&validEncryptionKey(),'OAuth credentials and token encryption are configured.','Configure both Google OAuth credentials and a valid token-encryption key.');
check('Built interface',existsSync(resolve(config.staticDir,'index.html')),'The production interface is built.','Run pnpm build before starting the service.');
check('Secondary backup',!!config.secondaryBackupDir&&config.secondaryBackupDir!==config.backupDir,'An independent backup target is configured.','Set SECONDARY_BACKUP_DIR to a separately administered Canadian recovery target.');

let sources:ReturnType<typeof calendarSources>=[];
try{sources=calendarSources();check('Calendar allowlist',!!process.env.CALENDAR_SOURCES_FILE&&sources.length>=7&&sources.some(s=>s.contractor==='3D Elevate'),`${sources.length} approved calendars are configured, including 3D Elevate.`,'Set CALENDAR_SOURCES_FILE to the approved calendar list and include the requested 3D Elevate source.');}
catch(error){checks.push({name:'Calendar allowlist',ok:false,detail:error instanceof Error?error.message:'Calendar allowlist is invalid.'});}

if(!existsSync(config.database))checks.push({name:'Runtime database',ok:false,detail:'The runtime database does not exist yet.'});
else{
 try{
  const db=new DatabaseSync(config.database,{readOnly:true});
  const integrity=db.prepare('PRAGMA integrity_check').get() as Record<string,string>;
  check('Database integrity',Object.values(integrity)[0]==='ok','SQLite integrity check passed.','SQLite integrity check failed.');
  const rows=db.prepare('SELECT id,payload FROM sync').all() as {id:string;payload:string}[];const syncs=new Map(rows.map(row=>[row.id,JSON.parse(row.payload) as SyncState]));
  const live=sources.map(source=>syncs.get(sourceId(source)));check('Calendar synchronization',sources.length>=7&&live.every(state=>state?.lastSuccess&&!state.error),'All approved calendars have a recorded successful synchronization.','One or more approved calendars have not synchronized successfully.');
  const backup=syncs.get('backup');const recent=!!backup?.lastSuccess&&Date.now()-Date.parse(backup.lastSuccess)<26*3600000&&!backup.error;
  check('Recent backup',recent,'A successful backup is less than 26 hours old.','No successful backup has been recorded in the last 26 hours.');
  db.close();
 }catch(error){checks.push({name:'Runtime database',ok:false,detail:error instanceof Error?error.message:'The runtime database could not be inspected.'});}
}

for(const item of checks)console.log(`${item.ok?'PASS':'FAIL'}  ${item.name}: ${item.detail}`);
const pending=checks.filter(item=>!item.ok).length;
console.log(`\n${checks.length-pending}/${checks.length} machine-checkable readiness gates passed.`);
console.log('Human sign-off is still required for residency, restore, authentication, calendar accuracy, accessibility and device checks.');
if(pending)process.exitCode=1;
