import ICAL from 'ical.js';
import {DateTime} from 'luxon';
import type {RawEvent} from './types.ts';
export function readICS(text:string,from='2026-01-01',to='2027-01-01'):RawEvent[]{
 const root=new ICAL.Component(ICAL.parse(text));
 for(const tz of root.getAllSubcomponents('vtimezone'))ICAL.TimezoneService.register(new ICAL.Timezone(tz));
 const components=root.getAllSubcomponents('vevent');const out=new Map<string,RawEvent>();
 const iso=(t:ICAL.Time)=>t.isDate?DateTime.fromISO(t.toString(),{zone:'America/Vancouver'}).toISO()!:t.zone.tzid==='floating'?DateTime.fromISO(t.toString(),{zone:'America/Vancouver'}).toISO()!:t.toJSDate().toISOString();
 const add=(ev:ICAL.Event,start:ICAL.Time,end:ICAL.Time,occurrence='')=>{
   const startISO=iso(start),day=DateTime.fromISO(startISO).setZone('America/Vancouver').toISODate()!;
   if(day<from||day>=to)return;
   const id=ev.uid+(occurrence?'|'+occurrence:'');
   out.set(id,{id,start:startISO,end:iso(end),title:ev.summary||'',location:ev.location||'',description:ev.description||'',status:String(ev.component.getFirstPropertyValue('status')||'').toLowerCase(),recurring:!!occurrence});
 };
 const masters=new Set<string>();
 for(const c of components){
  if(c.hasProperty('recurrence-id'))continue;
  const ev=new ICAL.Event(c);masters.add(ev.uid);
  for(const exception of components.filter(x=>x.hasProperty('recurrence-id')&&x.getFirstPropertyValue('uid')===ev.uid)){
   if(exception.hasProperty('dtstart'))ev.relateException(new ICAL.Event(exception));
  }
  if(!ev.startDate)continue;
  if(!ev.isRecurring()){add(ev,ev.startDate,ev.endDate);continue;}
  const iter=ev.iterator();let seen=0,next:ICAL.Time|null;
  while((next=iter.next())){
   if(++seen>25000)throw new Error('Calendar recurrence limit reached; import was not committed');
   if(iso(next).slice(0,10)>to)break;
   const d=ev.getOccurrenceDetails(next);add(d.item,d.startDate,d.endDate,iso(next));
  }
 }
 // Include detached/moved exceptions even when their original start is outside window.
 for(const c of components){if(!c.hasProperty('recurrence-id'))continue;const e=new ICAL.Event(c);if(e.startDate)add(e,e.startDate,e.endDate,iso(e.recurrenceId));
  else if(String(c.getFirstPropertyValue('status')).toLowerCase()==='cancelled'){add(e,e.recurrenceId,e.recurrenceId,iso(e.recurrenceId));}}
 return [...out.values()];
}
export function googleEvent(e:any):RawEvent {
 const original=e.originalStartTime?.dateTime||e.originalStartTime?.date;
 const start=e.start?.dateTime||e.start?.date||'';
 const norm=(v:string)=>v?DateTime.fromISO(v,{zone:'America/Vancouver'}).toUTC().toISO()!:'';
 // Google event IDs remain stable for cancelled tombstones where iCalUID is absent.
 return {id:e.id,start:norm(start),end:norm(e.end?.dateTime||e.end?.date||start),title:e.summary||'',location:e.location||'',description:e.description||'',status:e.status,recurring:!!original};
}
export const calendarWindow=(now:DateTime=DateTime.now())=>({from:now.setZone('America/Vancouver').minus({days:14}).startOf('day').toISO()!,to:now.setZone('America/Vancouver').plus({months:6}).startOf('day').toISO()!});
export async function collectGoogleEvents(token:string,calendar:string,syncToken?:string,fetcher:typeof fetch=fetch,now=DateTime.now()):Promise<{events:RawEvent[];syncToken:string;full:boolean;window?:{from:string;to:string}}> {
 let page:string|undefined;let cursor=syncToken;let full=!cursor;let restarted=false;let events:RawEvent[]=[];let pages=0;
 const window=calendarWindow(now);const timeMin=window.from,timeMax=window.to;
 do {
  if(++pages>100)throw new Error('Calendar has too many pages for one run');
  const url=new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events`);
  url.searchParams.set('singleEvents','true');url.searchParams.set('showDeleted','true');url.searchParams.set('maxResults','2500');
  if(cursor)url.searchParams.set('syncToken',cursor);else {url.searchParams.set('timeMin',timeMin);url.searchParams.set('timeMax',timeMax);}
  if(page)url.searchParams.set('pageToken',page);
  const response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
  if(response.status===410&&!restarted){cursor=undefined;page=undefined;full=true;restarted=true;events=[];continue;}
  if(!response.ok)throw new Error(response.status===401?'Calendar authorization expired. Reconnect.':'Calendar could not be read. Try again.');
  const body=await response.json() as any;events.push(...(body.items||[]).map(googleEvent));page=body.nextPageToken;
  if(!page){if(!body.nextSyncToken)throw new Error('Calendar returned an incomplete synchronization');return {events,syncToken:body.nextSyncToken,full,window};}
 }while(true);
}
export async function readGoogleEvent(token:string,calendar:string,id:string):Promise<RawEvent|null>{
 const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
 if(response.status===404||response.status===410)return null;
 if(!response.ok)throw new Error('Could not verify a moved calendar event. Previous records have been retained.');
 return googleEvent(await response.json());
}
