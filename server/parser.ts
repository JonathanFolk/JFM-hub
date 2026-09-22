import {DateTime} from 'luxon';
import {createHash} from 'node:crypto';
import type {RawEvent,Job} from './types.ts';
const aliases:Record<string,string[]>={PS:['Premium photo'],PP:['Premium photo'],EP:['Basic photo'],BP:['Basic photo'],BPS:['Basic photo'],VI:['Video'],PV:['Video'],EV:['Basic video'],BV:['Basic video'],DR:['Drone'],FP:['Floor plan'], '2D':['Floor plan'],'3D':['3D floor plan'], '3DFP':['3D floor plan'],TL:['Twilight'],PSVI:['Premium photo','Video'],PSDR:['Premium photo','Drone'],PSDRVI:['Premium photo','Drone','Video']};
const modifiers = new Set(['REVISIT','RESHOOT','RUSH','EXT','EXTERIOR','ONLY','FLEXIBLE','NEIGHBORHOOD','NEIGHBOURHOOD','WEATHER','PPE','NOTE']);
export const stableId=(source:string,id:string)=>createHash('sha256').update(source+'\0'+id).digest('hex').slice(0,32);
export function deadline(start:string,services:string[],holidays:string[]=[]):{due:string|null;deadlineBasis:string} {
  let day=DateTime.fromISO(start,{zone:'America/Vancouver'}).startOf('day');
  if(!day.isValid)return {due:null,deadlineBasis:'Date needs review'};
  // This is explicitly a proposed RE deadline, never a promise of delivery.
  const basic=services.includes('Basic photo');
  if(!services.some(s=>['Premium photo','Basic photo','Video','Basic video','Drone','Floor plan','3D floor plan'].includes(s)))return {due:null,deadlineBasis:'Confirm turnaround'};
  const isBusiness=(d:DateTime)=>d.weekday<=5&&!holidays.includes(d.toISODate()!);
  let count=basic?1:2;
  if(!basic&&[4,5].includes(day.weekday)) {
    day=day.plus({days:8-day.weekday});while(!isBusiness(day))day=day.plus({days:1});
  } else {
    if(day.weekday>5){while(!isBusiness(day))day=day.plus({days:1});count--;}
    while(count>0){day=day.plus({days:1});if(isBusiness(day))count--;}
  }
  return {due:day.toISODate(),deadlineBasis:'Suggested RE deadline. Weekday counting and holiday list need approval'};
}
export function parseBooking(raw:RawEvent,source:string,previous?:Job,contractor?:string):Job|null {
  let text=(raw.title||'').replace(/\s+/g,' ').trim();
  const sourceId=raw.id,id=stableId(source,sourceId);
  if(/^\[|^#\d/.test(text))return null;
  const cancelled=raw.status==='cancelled'||/^CANCEL(?:LED)?\b/i.test(text);
  const held=/^(?:HOLD|TBR|RESCHEDULE|RESCHEUDLE)\b/i.test(text);
  if(cancelled&&previous) return {...previous,title:previous.title,status:'Cancelled',due:null,start:raw.start||previous.start,end:raw.end||previous.end,issues:[...new Set([...previous.issues,'Cancellation requires review; no fee applied'])],updatedAt:new Date().toISOString()};
  if(contractor&&!/\bfor\s+j\b/i.test(text))return null;
  if(!text&&cancelled)return null; // Unrelated Google deletion: only a tombstone.
  const services:string[]=[],notes:string[]=[],issues:string[]=[];
  let body=text.replace(/^(?:CANCEL(?:LED)?(?: ON SITE)?|HOLD|TBR|RESCHEDULE|RESCHEUDLE)\b\s*/i,'');
  if(contractor){
    if(!body.toLowerCase().startsWith(contractor.toLowerCase()+' '))issues.push('Contractor naming pattern needs review');
    const escaped=contractor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    body=body.replace(new RegExp('^'+escaped+'\\s+','i'),'');
    const split=body.split(/\bfor\s+j\s+with\s+/i);
    if(split.length!==2)issues.push('Client after For J needs review');
  }
  if(/^Day time \+ twilight PP\b/i.test(body)){body=body.replace(/^Day time \+ twilight /i,'');notes.push('Twilight requested');services.push('Twilight');}
  let serviceStarted=false, clientStarted=false, clientParts:string[]=[];
  const words=body.replace(/\bfor\s+j\s+with\b/ig,' ').replace(/[+/]/g,' ').split(/\s+/);
  for(const word of words){
    const token=word.toUpperCase().replace(/^[(),]+|[(),]+$/g,'');
    if(!clientStarted&&aliases[token]&&(!serviceStarted||word===word.toUpperCase())){services.push(...aliases[token]);serviceStarted=true;}
    else if(!clientStarted&&modifiers.has(token)){notes.push(token);}
    else {clientStarted=true;clientParts.push(word);}
  }
  // Direct booking pattern only. Incidental service words in personal titles are excluded.
  const candidatePrefix=/^(?:(?:NOTE|PPE|REVISIT|RESHOOT|RUSH)\s+)*(?:PS|PP|EP|EV|BP|BPS|VI|PV|BV|DR|FP|2D|3D|3DFP|PSVI|PSDR|PSDRVI)\b/i.test(body)||/^Day time \+ twilight PP\b/i.test(body);
  if(!contractor&&!candidatePrefix&&!previous)return null;
  if(!serviceStarted&&!previous&&!contractor)return null;
  if(!serviceStarted&&contractor)issues.push('Requested services and contractor naming need review');
  let client=clientParts.join(' ').replace(/\b\d+(?:\.\d+)?k?\s*(?:sf|sqft)\b/ig,'').replace(/[<>]/g,'').replace(/\s+/g,' ').trim();
  if(contractor){const named=body.split(/\bfor\s+j\s+with\s+/i);client=named.length===2?named[1].trim():'';}
  if(/^Day time/i.test(client)){client=client.replace(/^Day time\s+twilight\s*/i,'');notes.push('Twilight requested');services.push('Twilight');}
  if(!client)issues.push('Client needs identifying');
  if(/\b(?:Design|Homes|Projects|Contracting|Marketing|Development)\b/i.test(client))issues.push('Confirm pricing profile and agreed quote');
  if(/\b(?:and|&)\b|&/i.test(client))issues.push('Confirm billing parties');
  if(notes.some(x=>['RUSH','REVISIT','RESHOOT','NEIGHBORHOOD','NEIGHBOURHOOD'].includes(x)))issues.push('Confirm requested services and any fee during drafting');
  if(!raw.location)issues.push('Property needs confirming');
  if(cancelled)issues.push('Cancellation requires review; no fee applied');
  if(held)issues.push('Held or rescheduled booking; do not treat as completed');
  if(/\b(?:RBC VIP Cashout|Jonathan with|Ali)\b/i.test(client))issues.push('Confirm this is a client booking');
  const unique=[...new Set(services)];
  const dates=deadline(raw.start,unique);
  if(issues.includes('Confirm pricing profile and agreed quote')){dates.due=null;dates.deadlineBasis='Confirm turnaround for this pricing profile';}
  const needsReview=issues.includes('Confirm this is a client booking')||!!contractor&&issues.some(i=>/naming|For J|identifying/.test(i));
  return {id,source,sourceId,title:text,client,services:unique,notes:[...new Set(notes)],start:raw.start,end:raw.end,location:raw.location||'',status:cancelled?'Cancelled':/^(?:TBR|RESCHEDULE|RESCHEUDLE)\b/i.test(text)?'To reschedule':held?'Held':needsReview?'Needs review':'Booked',issues,due:cancelled||held||needsReview?null:dates.due,deadlineBasis:dates.deadlineBasis,updatedAt:new Date().toISOString()};
}
