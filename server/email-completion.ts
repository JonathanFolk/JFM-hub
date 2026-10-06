import type {Job} from './types.ts';
import type {MasterRow,CompletionEvidence} from './completion.ts';

// An audited project may cover several calendar records and split invoices.
// This is not a fuzzy matcher: an explicit, reviewed job-to-project mapping is required.
export type AuditedProject={jobIds:string[];sheetRows:number[];invoiceNumbers:string[];project:string;basis:string;emails:CompletionEvidence['emails']};
export function auditedProjectCompletions(projects:AuditedProject[],jobs:Job[],rows:MasterRow[],now=new Date()){
 const seen=new Set<string>();
 return projects.flatMap(project=>{
  if(!project.jobIds.length||!project.sheetRows.length||!project.emails.length||!project.project.trim()||!project.basis.trim())throw new Error('Incomplete project evidence');
  const paidRows=project.sheetRows.map(n=>{
   const matches=rows.filter(r=>r.row===n);
   if(matches.length!==1||!matches[0].paid)throw new Error(`Sheet row ${n} is missing or not paid`);
   if(!project.invoiceNumbers.includes(matches[0].number))throw new Error(`Invoice number changed on row ${n}`);
   if(!Number.isFinite(Date.parse(matches[0].date))||Date.parse(matches[0].date)>now.getTime())throw new Error(`Invalid invoice date on row ${n}`);
   return matches[0];
  });
  return project.jobIds.map(jobId=>{
   const job=jobs.find(j=>j.id===jobId);
   if(!job||job.status==='Cancelled'||!Number.isFinite(Date.parse(job.start))||Date.parse(job.start)>now.getTime())throw new Error(`Missing, cancelled or future job: ${jobId}`);
   if(seen.has(jobId))throw new Error(`Conflicting project mappings: ${jobId}`);
   seen.add(jobId);
   if(!paidRows.some(r=>r.date>=job.start.slice(0,10)))throw new Error(`All invoices predate job: ${jobId}`);
   return {jobId,row:paidRows[0],basis:project.basis,evidence:{rows:paidRows,emails:project.emails,project:project.project}};
  });
 });
}
