import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync,chmodSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'vite';

const source=resolve('data/hub.sqlite'),directory=resolve('data/local-preview'),destination=resolve(directory,'hub.sqlite');
mkdirSync(directory,{recursive:true,mode:0o700});
if(!existsSync(destination)){
 if(!existsSync(source))throw new Error('No local data/hub.sqlite found. Import a local reference snapshot first.');
 const original=new DatabaseSync(source,{readOnly:true});
 try{await backup(original,destination);}finally{original.close();}
 chmodSync(destination,0o600);
 if(existsSync('data/calendars.json'))copyFileSync('data/calendars.json',resolve(directory,'calendars.json'));
 console.log('Created an independent preview database from the local snapshot. Original database is unchanged.');
}
const copy=new DatabaseSync(destination);
try{
 const check=copy.prepare('PRAGMA integrity_check').get();if(!check||Object.values(check)[0]!=='ok')throw new Error('Preview database failed integrity check.');
 copy.exec("DELETE FROM sessions; DELETE FROM oauth; DELETE FROM settings WHERE key IN ('calendar-refresh','gmail-refresh','sheets-refresh','reconciliation-history-id');");
 for(const row of copy.prepare('SELECT id,payload FROM sync').all() as {id:string;payload:string}[]){const state=JSON.parse(row.payload);delete state.syncToken;if(state.mode==='live'){state.mode='export';state.snapshotAt=state.lastSuccess;state.error=null;}copy.prepare('UPDATE sync SET payload=? WHERE id=?').run(JSON.stringify(state),row.id);}
}finally{copy.close();}
await build({build:{outDir:resolve(directory,'build'),emptyOutDir:true}});
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{stdio:'inherit',env:{...process.env,APP_MODE:'local',HUB_PREVIEW:'1',PORT:'4313',APP_ORIGIN:'http://127.0.0.1:4313',DATA_DIR:directory,BACKUP_DIR:resolve(directory,'backups'),STATIC_DIR:resolve(directory,'build'),SECONDARY_BACKUP_DIR:'',CALENDAR_SOURCES_FILE:resolve(directory,'calendars.json'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',TOKEN_ENCRYPTION_KEY:''}});
child.on('exit',code=>{process.exitCode=code??0;});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));
