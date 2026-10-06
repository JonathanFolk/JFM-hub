import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {masterRows,type Completion} from '../server/completion.ts';
import {auditedProjectCompletions,type AuditedProject} from '../server/email-completion.ts';
import type {Job} from '../server/types.ts';

// Fixed isolated target. Dry run unless --apply; no network or Google mutations.
const apply=process.argv.includes('--apply');
const source=JSON.parse(readFileSync('data/local-preview/email-invoice-sheet.json','utf8'));
const projects:AuditedProject[]=JSON.parse(readFileSync('data/local-preview/email-completion-approved.json','utf8'));
const db=new DatabaseSync('data/local-preview/hub.sqlite',{readOnly:!apply});
try{
 const jobs=db.prepare('SELECT payload FROM jobs').all().map(r=>JSON.parse(String(r.payload)) as Job);
 const excluded=new Set([...db.prepare('SELECT job_id FROM deleted_items').all(),...db.prepare('SELECT job_id FROM completed_jobs').all()].map(r=>String(r.job_id)));
 for(const r of db.prepare("SELECT key FROM settings WHERE key LIKE 'previous-completion-%'").all())excluded.add(String(r.key).slice('previous-completion-'.length));
 const matches=auditedProjectCompletions(projects,jobs,masterRows(source.values,source.startRow)).filter(m=>!excluded.has(m.jobId));
 const reviews=db.prepare('SELECT payload FROM reviews').all().map(r=>JSON.parse(String(r.payload)));
 const moved=new Set(matches.map(m=>m.jobId));
 const removedReviews=reviews.filter(r=>r.status==='open'&&r.kind!=='Calendar cancellation'&&moved.has(r.jobId));
 console.log(JSON.stringify({newCompletions:matches.length,reviewItemsResolved:removedReviews.length,reviewBookingsResolved:new Set(removedReviews.map(r=>r.jobId)).size,matches:matches.map(m=>({jobId:m.jobId,project:m.evidence.project,invoices:m.evidence.rows.map(r=>r.number)}))},null,2));
 if(apply&&matches.length){
  const backupPath=`data/local-preview/before-email-completion-${Date.now()}.sqlite`;await backup(db,backupPath);
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const match of matches){
    const completion:Completion={...match,spreadsheetId:source.spreadsheetId,gid:source.gid,readAt:source.readAt,matchedAt:new Date().toISOString()};
    db.prepare('INSERT INTO completed_jobs VALUES(?,?)').run(match.jobId,JSON.stringify(completion));
    db.prepare('INSERT INTO audit(at,action,entity_id) VALUES(?,?,?)').run(completion.matchedAt,'email-invoice-paid-sheet-completion',match.jobId);
   }
   db.exec('COMMIT');console.log(`Applied locally; backup: ${backupPath}`);
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
}finally{db.close();}
