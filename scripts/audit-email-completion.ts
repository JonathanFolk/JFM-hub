import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {masterRows,clientKey,completionAddress} from '../server/completion.ts';
const db=new DatabaseSync('data/local-preview/hub.sqlite',{readOnly:true});
const source=JSON.parse(readFileSync('data/local-preview/email-invoice-sheet.json','utf8'));
const rows=masterRows(source.values,source.startRow);
const threads=JSON.parse(readFileSync('data/local-preview/email-invoice-threads.json','utf8'));
const done=new Set(db.prepare('SELECT job_id FROM completed_jobs').all().map(r=>r.job_id));
const deleted=new Set(db.prepare('SELECT job_id FROM deleted_items').all().map(r=>r.job_id));
const reviewIds=new Set(db.prepare('SELECT payload FROM reviews').all().map(r=>JSON.parse(String(r.payload))).filter(r=>r.status==='open').map(r=>r.jobId));
const jobs=db.prepare('SELECT payload FROM jobs').all().map(r=>JSON.parse(String(r.payload))).filter(j=>!done.has(j.id)&&!deleted.has(j.id));
for(const t of threads){
 const invoices=t.messages.filter((m:any)=>m.sent).flatMap((m:any)=>m.attachments.flatMap((a:any)=>{const num=a.filename.match(/invoice\s+(\d{5}[a-z]?)(?=\s|[-_.])/i)?.[1];return rows.filter(r=>r.paid&&r.number===num).map(r=>({row:r,message:m.id,filename:a.filename}));}));
 if(!invoices.length)continue;
 const subjects=[...new Set(t.messages.map((m:any)=>m.headers.find((h:any)=>h.name.toLowerCase()==='subject')?.value||''))] as string[];
 const addresses=subjects.map(s=>s.replace(/^(?:(?:re|fwd):\s*)*(?:\[EXTERNAL\]\s*)?(?:media|photo|floor plan)\s+(?:delivery|plan)?\s*(?:for\s+)?/i,'').replace(/\s*\([^)]*\)|\s+-\s+[A-Za-z].*$/g,'').trim()).map(s=>completionAddress(s)).filter(Boolean);
 const candidates=jobs.filter(j=>{const a=completionAddress(j.location);return a&&addresses.some(b=>a.key===b!.key)&&invoices.some((i:any)=>Date.parse(j.start)<=Date.parse(i.row.date)+864e5&&Date.parse(i.row.date)-Date.parse(j.start)<120*864e5);});
 if(candidates.length)console.log(JSON.stringify({thread:t.id,subjects,rows:[...new Set(invoices.map((i:any)=>i.row.row))],invoiceNumbers:[...new Set(invoices.map((i:any)=>i.row.number))],jobs:candidates.map(j=>({id:j.id,title:j.title,date:j.start.slice(0,10),status:j.status,review:reviewIds.has(j.id)}))}));
}
db.close();
