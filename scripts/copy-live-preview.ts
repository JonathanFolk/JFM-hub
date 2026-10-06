import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';

// Explicit, read-only export. OAuth, sessions, refresh tokens and credentials are excluded.
const [host,key]=process.argv.slice(2);
if(!host||!key)throw new Error('Usage: tsx scripts/copy-live-preview.ts user@verified-host /path/to/deployment-key');
const tables=['jobs','history','reviews','invoice_drafts','invoice_history','shoot_sort','deleted_items','rates','rate_guidance','reference_records','reference_imports','client_pricing_overrides','reconciliation_suggestions'];
const sourceCode=`const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/var/lib/jfm-hub/data/hub.sqlite',{readOnly:true});db.exec('BEGIN');const tables=${JSON.stringify(tables)};const result={};for(const name of tables)result[name]=db.prepare('SELECT * FROM '+name).all();result.sync=db.prepare('SELECT id,payload FROM sync').all().map(row=>{const state=JSON.parse(row.payload);delete state.syncToken;state.mode='export';state.snapshotAt=state.lastSuccess;state.error=null;return {...row,payload:JSON.stringify(state)};});result.settings=db.prepare("SELECT key,value FROM settings WHERE key IN ('active-calendar','snapshot-note')").all();db.exec('COMMIT');db.close();process.stdout.write(JSON.stringify(result));`;
const shellQuote=(text:string)=>"'"+text.replaceAll("'","'\\''")+"'";
const {stdout}=await promisify(execFile)('ssh',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-i',resolve(key),host,`sudo -n -u jfm /usr/local/bin/node -e ${shellQuote(sourceCode)}`],{maxBuffer:32*1024*1024,timeout:60000}).catch(()=>{throw new Error('Read-only live export failed. Check the verified host, key and database path; no preview data was changed.');});
const snapshot=JSON.parse(stdout) as Record<string,Record<string,any>[]>;
if(!Array.isArray(snapshot.jobs)||!snapshot.jobs.length)throw new Error('Live export has no jobs; preview not replaced.');
const db=new DatabaseSync(resolve('data/local-preview/hub.sqlite'));
try{
 if(Number((db.prepare('SELECT count(*) AS n FROM jobs').get() as {n:number}).n))throw new Error('The preview already has bookings. Use a new preview copy rather than overwriting review work.');
 db.exec('BEGIN IMMEDIATE');
 for(const table of [...tables,'sync','settings'])for(const row of snapshot[table]||[]){const columns=Object.keys(row);const allowed=new Set((db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).map(c=>c.name));if(!columns.every(c=>allowed.has(c)))throw new Error('Unexpected schema in '+table);db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.map(c=>'"'+c+'"').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));}
 db.prepare("DELETE FROM settings WHERE key IN ('workflow-v2','workflow-v3')").run();
 db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('preview-imported-at',new Date().toISOString());
 db.exec('COMMIT');console.log(`Copied ${snapshot.jobs.length} live bookings and ${snapshot.invoice_drafts?.length||0} drafts into the isolated preview. Live database was read-only; no authorization material copied.`);
}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}finally{db.close();}
