import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {paidCompletionMatches,masterRows} from '../server/completion.ts';
import type {Completion} from '../server/completion.ts';
import type {Job} from '../server/types.ts';

// Local-only, read-only dry run by default. Never connects to or writes Google.
const apply=process.argv.includes('--apply');
const source=JSON.parse(readFileSync('data/local-preview/master-sheet-paid-refresh.json','utf8'));
const db=new DatabaseSync('data/local-preview/hub.sqlite',{readOnly:!apply});
try{
 const rows=masterRows(source.values,source.startRow);
 const deleted=new Set(db.prepare('SELECT job_id FROM deleted_items').all().map(r=>r.job_id));
 const completed=new Set(db.prepare('SELECT job_id FROM completed_jobs').all().map(r=>r.job_id));
 const reopened=new Set(db.prepare("SELECT key FROM settings WHERE key LIKE 'previous-completion-%'").all().map(r=>String(r.key).slice('previous-completion-'.length)));
 const jobs=(db.prepare('SELECT payload FROM jobs').all() as {payload:string}[]).map(r=>JSON.parse(r.payload) as Job).filter(j=>!deleted.has(j.id));
 const matches=paidCompletionMatches(jobs,rows).filter(m=>!completed.has(m.jobId)&&!reopened.has(m.jobId));
 console.log(JSON.stringify({paidRows:rows.filter(r=>r.paid).length,newCompletions:matches.length,matches:matches.map(m=>({jobId:m.jobId,client:jobs.find(j=>j.id===m.jobId)!.client,address:jobs.find(j=>j.id===m.jobId)!.location,shoot:jobs.find(j=>j.id===m.jobId)!.start,row:m.row.row,invoice:m.row.number,invoiceDate:m.row.date,sheetAddress:m.row.notes}))},null,2));
 if(apply&&matches.length){
  const backupPath=`data/local-preview/before-paid-completion-${Date.now()}.sqlite`;await backup(db,backupPath);
  db.exec('BEGIN IMMEDIATE');try{
   for(const match of matches){const completion:Completion={...match,spreadsheetId:source.spreadsheetId,gid:source.gid,readAt:source.readAt,matchedAt:new Date().toISOString()};db.prepare('INSERT INTO completed_jobs VALUES(?,?)').run(match.jobId,JSON.stringify(completion));db.prepare('INSERT INTO audit(at,action,entity_id) VALUES(?,?,?)').run(completion.matchedAt,'paid-master-sheet-completion',match.jobId);}
   db.exec('COMMIT');console.log(`Moved ${matches.length} paid matches to Complete in the local preview. Backup: ${backupPath}`);
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
}finally{db.close();}
