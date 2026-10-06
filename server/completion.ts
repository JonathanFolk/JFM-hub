import {DateTime} from 'luxon';
import type {Job} from './types.ts';
export type MasterRow={row:number;number:string;client:string;date:string;totalCents:number;paid:boolean;notes:string;orders:string};
export type CompletionEvidence={rows:MasterRow[];emails:{threadId:string;messageId:string;subject:string}[];project:string};
export type Completion={jobId:string;row:MasterRow;spreadsheetId:string;gid:number;readAt:string;matchedAt:string;basis:string;evidence?:CompletionEvidence};
export function masterRows(values:unknown[][],startRow=7):MasterRow[]{return values.flatMap((r,index)=>{
 const [date,number,client,,,total,paid,notes,orders]=r;
 if(typeof date!=='number'||!number||typeof client!=='string'||typeof total!=='number'||total<=0||/\b(?:void|draft|estimate|quote)\b/i.test([number,notes,orders].join(' ')))return [];
 return [{row:startRow+index,number:String(number),client,date:DateTime.fromISO('1899-12-30').plus({days:date}).toISODate()!,totalCents:Math.round(total*100),paid:paid===true,notes:String(notes||''),orders:String(orders||'')}];
});}
export const clientKey=(s:string)=>s.toLowerCase().replace(/\(?[<>~]?\s*\d[\d.,]*\s*k?\s*(?:sq\s*ft|sqft|sf)\)?/gi,'').replace(/[^a-z0-9]+/g,' ').trim();
export const streetKey=(s:string)=>s.split(',')[0].toLowerCase().replace(/\b(?:street|avenue|road|drive|court|crescent|boulevard|place)\b/g,m=>({street:'st',avenue:'ave',road:'rd',drive:'dr',court:'ct',crescent:'cres',boulevard:'blvd',place:'pl'}[m]!)).replace(/\b(?:east|west|north|south)\b/g,m=>m[0]).replace(/\b(?:unit|suite|apt)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
// Normalize formatting, never infer a missing unit or correct a street number.
export function completionAddress(value:string){
 let text=value.toLowerCase().replace(/\b(?:unit|suite|apt)\s*/g,'#').replace(/\s+/g,' ').trim();
 let unit='';const leading=text.match(/^#?([a-z0-9]+)\s*(?:-\s*|,\s*|\s+)(?=\d+[a-z]?\s+(?:\d+(?:st|nd|rd|th)\b|[a-z]))/);
 if(leading){unit=leading[1];text=text.slice(leading[0].length);}
 const trailing=text.match(/\s*#\s*([a-z0-9]+)\b/);if(trailing){if(unit&&unit!==trailing[1])return null;unit=trailing[1];text=text.replace(trailing[0],'');}
 text=text.split(',')[0].replace(/\b(?:(?:north|west|new)\s+)?(?:vancouver|burnaby|richmond|coquitlam|westminster|surrey|gibsons|squamish|pitt meadows|port moody)\b.*$/,'').trim();
 const key=streetKey(text),match=key.match(/^(\d+[a-z]?)\s+(.+)$/);if(!match||!/[a-z]/.test(match[2]))return null;
 return {unit,number:match[1],street:match[2],key:[unit,match[1],match[2]].join('|')};
}
export function paidCompletionMatches(jobs:Job[],rows:MasterRow[],now:DateTime=DateTime.now()){
 const eligible=jobs.filter(j=>!j.floorPlanSource&&!j.supportingJobId&&DateTime.fromISO(j.start)<=now);
 // Consider unpaid competing rows too; a paid checkbox must not break a tie.
 const pairs=eligible.map(job=>{const address=completionAddress(job.location);return {job,rows:rows.filter(row=>{
  const days=DateTime.fromISO(row.date).diff(DateTime.fromISO(job.start).setZone('America/Vancouver').startOf('day'),'days').days;
  return !!address&&!!clientKey(job.client)&&clientKey(job.client)===clientKey(row.client)&&address.key===completionAddress(row.notes)?.key&&days>=0&&days<=90&&DateTime.fromISO(row.date)<=now;
 })};});
 return pairs.filter(p=>p.job.status!=='Cancelled'&&p.rows.length===1&&p.rows[0].paid&&!/\b(?:partial|deposit|rebill|relicens|cancel)/i.test(p.rows[0].notes+' '+p.rows[0].orders)&&pairs.filter(other=>other.rows.some(r=>r.row===p.rows[0].row)).length===1).map(p=>({jobId:p.job.id,row:p.rows[0],basis:'Paid checkbox checked; unique exact client + normalized full street/unit address; invoice dated on/after shoot within 90 days.'}));
}
export function sheetCompletionMatches(jobs:Job[],rows:MasterRow[],now:DateTime=DateTime.now()){
 const eligible=jobs.filter(j=>!j.floorPlanSource&&!j.supportingJobId&&j.status==='Booked'&&DateTime.fromISO(j.start)<=now);
 const pairs=eligible.map(job=>({job,rows:rows.filter(row=>{
  const days=DateTime.fromISO(row.date).diff(DateTime.fromISO(job.start).setZone('America/Vancouver').startOf('day'),'days').days;
  const address=completionAddress(job.location);
  return !!address&&!!clientKey(job.client)&&clientKey(job.client)===clientKey(row.client)&&address.key===completionAddress(row.notes)?.key&&days>=0&&days<=90&&DateTime.fromISO(row.date)<=now;
 })}));
 return pairs.filter(pair=>pair.rows.length===1&&pair.rows[0].totalCents>0&&!/\b(?:partial|deposit|rebill|relicens|cancel)\b/i.test(pair.rows[0].notes+' '+pair.rows[0].orders)&&pairs.filter(other=>other.rows.some(row=>row.row===pair.rows[0].row)).length===1).map(pair=>({jobId:pair.job.id,row:pair.rows[0],basis:'Unique exact client and full street/unit address in the live 2026 master Sheet; invoice dated on/after shoot within 90 days. Payment status remains separate.'}));
}
export function completionMatches(jobs:Job[],rows:MasterRow[],now=DateTime.now()){
 const eligible=jobs.filter(j=>!j.floorPlanSource&&!j.supportingJobId&&j.status!=='Cancelled'&&DateTime.fromISO(j.start)<=now);
 const pairs=eligible.map(job=>{const key=streetKey(job.location);return {job,rows:rows.filter(row=>{const days=DateTime.fromISO(row.date).diff(DateTime.fromISO(job.start).setZone('America/Vancouver').startOf('day'),'days').days;return clientKey(job.client)===clientKey(row.client)&&/\d/.test(key)&&key.length>6&&streetKey(row.notes)===key&&days>=0&&days<=90;})};});
 return pairs.filter(p=>p.rows.length===1&&pairs.filter(other=>other.rows.some(r=>r.row===p.rows[0].row)).length===1).map(p=>({jobId:p.job.id,row:p.rows[0],basis:'Unique exact client + full street/unit address; invoice dated on/after shoot within 90 days.'}));
}
