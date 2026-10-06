import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {completionMatches,masterRows} from '../server/completion.ts';
import type {Job} from '../server/types.ts';
const path='data/local-preview/hub.sqlite';
const source=JSON.parse(readFileSync('data/local-preview/master-sheet-2026.json','utf8'));
const db=new DatabaseSync(path,{readOnly:!process.argv.includes('--apply')});
try{
 const rows=masterRows(source.values,source.startRow),deleted=new Set(db.prepare('SELECT job_id FROM deleted_items').all().map(r=>r.job_id));
 const jobs=(db.prepare('SELECT payload FROM jobs').all() as {payload:string}[]).map(r=>JSON.parse(r.payload) as Job).filter(j=>!deleted.has(j.id));
 const matches=completionMatches(jobs,rows);
 console.log(JSON.stringify({eligibleSheetRows:rows.length,matches:matches.map(m=>({...m,job:jobs.find(j=>j.id===m.jobId)?.title}))},null,2));
 if(process.argv.includes('--apply')){
  await backup(db,`data/local-preview/before-completion-${Date.now()}.sqlite`);
  db.exec('CREATE TABLE IF NOT EXISTS completed_jobs(job_id TEXT PRIMARY KEY,payload TEXT NOT NULL); BEGIN IMMEDIATE');
  for(const match of matches){const completion={...match,spreadsheetId:source.spreadsheetId,gid:source.gid,readAt:source.readAt,matchedAt:new Date().toISOString()};db.prepare('INSERT OR REPLACE INTO completed_jobs VALUES(?,?)').run(match.jobId,JSON.stringify(completion));db.prepare('INSERT INTO audit(at,action,entity_id) VALUES(?,?,?)').run(completion.matchedAt,'master-sheet-completion-matched',match.jobId);}
  db.exec('COMMIT');console.log(`Applied ${matches.length} verified completions to the isolated preview only.`);
 }
}finally{db.close();}
