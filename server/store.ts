import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import type {Job,RawEvent,Review,SyncState} from './types.ts';
import {parseBooking,stableId} from './parser.ts';
export class Store {
 db:DatabaseSync;
 constructor(public path:string){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,source TEXT NOT NULL,source_id TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(source,source_id));
   CREATE TABLE IF NOT EXISTS ignored(id TEXT PRIMARY KEY,source TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sync(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,expires INTEGER NOT NULL,payload TEXT NOT NULL);
  `);
 }
 getSetting(key:string){return (this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined)?.value;}
 setSetting(key:string,value:string){this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key,value);}
 jobs():Job[]{return (this.db.prepare('SELECT payload FROM jobs').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 reviews():Review[]{return (this.db.prepare('SELECT payload FROM reviews').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 syncs():SyncState[]{return (this.db.prepare('SELECT payload FROM sync').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 sync(id:string){return this.syncs().find(s=>s.id===id);}
 setSync(state:SyncState){this.db.prepare('INSERT OR REPLACE INTO sync VALUES(?,?)').run(state.id,JSON.stringify(state));}
 audit(action:string,id:string){this.db.prepare('INSERT INTO audit(at,action,entity_id) VALUES(?,?,?)').run(new Date().toISOString(),action,id);}
 review(r:Review,force=false){const old=this.reviews().find(x=>x.id===r.id);if(!force&&old&&old.detail===r.detail&&old.title===r.title)return;this.db.prepare('INSERT OR REPLACE INTO reviews VALUES(?,?)').run(r.id,JSON.stringify(r));}
 resolve(id:string,status:'reviewed'|'dismissed',resolution:string){const old=this.reviews().find(r=>r.id===id);if(!old)throw new Error('Review not found');this.db.prepare('UPDATE reviews SET payload=? WHERE id=?').run(JSON.stringify({...old,status,resolution,updatedAt:new Date().toISOString()}),id);this.audit('review-'+status,id);}
 apply(source:string,events:RawEvent[],options:{full?:boolean;contractor?:string;state?:SyncState}={}){
  const previous=this.jobs().filter(j=>j.source===source),byId=new Map(previous.map(j=>[j.sourceId,j]));let changed=0;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   for(const raw of events){
    const old=byId.get(raw.id);const job=parseBooking(raw,source,old,options.contractor);const id=stableId(source,raw.id);
    if(!job){
     this.db.prepare('INSERT OR IGNORE INTO ignored VALUES(?,?)').run(id,source);
     if(old){const update={...old,status:'Needs review',issues:[...new Set([...old.issues,'Title no longer matches a booking; confirm removal'])]};this.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run(JSON.stringify(update),id);this.review({id:'changed-'+id,kind:'Booking changed',title:old.client,detail:'The source no longer matches a booking. Historical details are preserved for review.',jobId:id,source,status:'open',updatedAt:new Date().toISOString()});}
     continue;
    }
    const same=old&&JSON.stringify({...old,updatedAt:''})===JSON.stringify({...job,updatedAt:''});
    if(!same){changed++;if(old)this.db.prepare('INSERT INTO history(job_id,at,payload) VALUES(?,?,?)').run(old.id,new Date().toISOString(),JSON.stringify(old));
     this.db.prepare('INSERT OR REPLACE INTO jobs VALUES(?,?,?,?)').run(id,source,raw.id,JSON.stringify(job));
     this.audit(old?'booking-updated':'booking-imported',id);
     if(old)this.review({id:'changed-'+id,kind:'Booking changed',title:job.client,detail:'A date, title, service, property or status changed. Check the job before acting.',jobId:id,source,status:'open',updatedAt:new Date().toISOString()},true);
    }
    if(job.issues.length)this.review({id:'parse-'+id,kind:'Check booking',title:job.client||'Client needs review',detail:job.issues.join('. '),jobId:id,source,status:'open',updatedAt:new Date().toISOString()});
   }
   if(options.full){const ids=new Set(events.map(e=>e.id));for(const old of previous)if(!ids.has(old.sourceId)){
    this.review({id:'missing-'+old.id,kind:'Missing from source',title:old.client,detail:'Not in the latest full snapshot. Check deletion, date range or a moved booking; it has not been erased.',jobId:old.id,source,status:'open',updatedAt:new Date().toISOString()});
   }}
   if(options.state)this.setSync(options.state);
   this.db.exec('COMMIT');return {changed,count:this.jobs().filter(j=>j.source===source).length};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 async backup(path:string){mkdirSync(dirname(path),{recursive:true,mode:0o700});await backup(this.db,path);chmodSync(path,0o600);const check=new DatabaseSync(path,{readOnly:true});const valid=check.prepare('PRAGMA integrity_check').get() as Record<string,string>;check.close();if(Object.values(valid)[0]!=='ok')throw new Error('Backup verification failed');return path;}
 close(){this.db.close();}
}
