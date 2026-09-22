import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {parseBooking,deadline} from '../server/parser.ts';
import {Store} from '../server/store.ts';
import {readICS,collectGoogleEvents} from '../server/calendar.ts';
import {seal,unseal,signedIn} from '../server/auth.ts';
import {config,validateConfig} from '../server/config.ts';
import {scheduledTick} from '../server/sync.ts';
import type {RawEvent} from '../server/types.ts';
const raw=(title='PP Test Client',extra:Partial<RawEvent>={}):RawEvent=>({id:'test-1',title,start:'2026-09-21T10:00:00-07:00',end:'2026-09-21T11:00:00-07:00',location:'Test property',...extra});
test('service aliases preserve client names and never infer drone from exterior',()=>{
 assert.equal(parseBooking(raw('PP Vi Tran'),'test')?.client,'Vi Tran');
 assert.equal(parseBooking(raw('PP Dr Smith'),'test')?.client,'Dr Smith');
 const j=parseBooking(raw('PP EXT PPE WEATHER Test Client'),'test')!;
 assert.deepEqual(j.services,['Premium photo']);assert.ok(j.notes.includes('PPE'));assert.ok(j.notes.includes('WEATHER'));
 assert.deepEqual(parseBooking(raw('EP EV 3DFP Test Client'),'test')?.services,['Basic photo','Basic video','3D floor plan']);
 assert.equal(parseBooking(raw('Dinner with PP Test Client'),'test'),null);
 assert.equal(parseBooking(raw('[123] PP Test Client'),'test'),null);
});
test('contractors require For J and hold/cancellation stay non-completed',()=>{
 assert.equal(parseBooking(raw('George PP with Test Client'),'g',undefined,'George'),null);
 const j=parseBooking(raw('TBR George PP For J with Test Client'),'g',undefined,'George')!;
 assert.equal(j.client,'Test Client');assert.equal(j.status,'To reschedule');assert.equal(j.due,null);
 assert.equal(parseBooking(raw('CANCEL PP Test Client'),'test')?.status,'Cancelled');
});
test('repeat import is stable; moving and deletion preserve history and review',()=>{
 const s=new Store(':memory:');try{
 assert.equal(s.apply('test',[raw()]).changed,1);assert.equal(s.apply('test',[raw()]).changed,0);
 s.apply('test',[raw(undefined,{start:'2026-09-22T10:00:00-07:00'})]);
 assert.equal(s.jobs().length,1);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM history').get()?.n,1);
 s.apply('test',[raw('',{status:'cancelled',start:'',end:''})]);
 assert.equal(s.jobs()[0].client,'Test Client');assert.equal(s.jobs()[0].status,'Cancelled');assert.equal(s.jobs()[0].due,null);
 assert.equal(s.apply('test',[raw('',{status:'cancelled',start:'',end:''})]).changed,0);
 s.apply('test',[],{full:true});assert.equal(s.jobs().length,1);assert.ok(s.reviews().some(r=>r.kind==='Missing from source'));
 }finally{s.close();}
});
test('a failed batch rolls back earlier changes and successful timestamp',()=>{
 const s=new Store(':memory:');try{
 s.apply('test',[raw()]);const before=s.jobs();
 assert.throws(()=>s.apply('test',[raw('PP Changed'),raw(undefined,{id:undefined as any})],{state:{id:'test',label:'Test',mode:'live',lastAttempt:null,lastSuccess:'new',snapshotAt:null,error:null,count:2}}));
 assert.deepEqual(s.jobs(),before);assert.equal(s.sync('test'),undefined);
 }finally{s.close();}
});
test('recurring calendar exceptions replace the original occurrence without duplicates',()=>{
 const ics=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:series\r\nDTSTART:20260921T170000Z\r\nDTEND:20260921T180000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:PP Test Client\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:series\r\nRECURRENCE-ID:20260922T170000Z\r\nDTSTART:20260922T190000Z\r\nDTEND:20260922T200000Z\r\nSUMMARY:PP Test Client moved\r\nEND:VEVENT\r\nEND:VCALENDAR`;
 const events=readICS(ics);assert.equal(events.length,3);assert.equal(events.find(e=>e.id.endsWith('2026-09-22T17:00:00.000Z'))?.start,'2026-09-22T19:00:00.000Z');
});
test('expired Google cursor restarts and paginates without retaining discarded results',async()=>{
 const urls:string[]=[];const responses=[new Response('',{status:410}),Response.json({items:[{id:'a',summary:'PP Test',start:{date:'2026-09-21'}}],nextPageToken:'page2'}),Response.json({items:[{id:'b',status:'cancelled'}],nextSyncToken:'new-cursor'})];
 const fetcher=(async(u:any)=>{urls.push(String(u));return responses.shift()!;}) as typeof fetch;
 const r=await collectGoogleEvents('secret','primary','expired',fetcher);
 assert.equal(r.full,true);assert.equal(r.events.length,2);assert.equal(r.syncToken,'new-cursor');
 assert.ok(urls[0].includes('syncToken=expired'));assert.ok(!urls[1].includes('syncToken'));assert.ok(urls[2].includes('pageToken=page2'));
});
test('partial Google download never returns a successful snapshot',async()=>{
 let i=0;const fetcher=(async()=>++i===1?Response.json({items:[{id:'a'}],nextPageToken:'next'}):new Response('',{status:503})) as typeof fetch;
 await assert.rejects(collectGoogleEvents('secret','primary',undefined,fetcher),/could not be read/);
});
test('review decisions survive identical reimport and backup can be restored',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jfm-test-'));const s=new Store(join(dir,'live.sqlite'));
 try{
 s.apply('test',[raw('PP Test Client',{location:''})]);const review=s.reviews()[0];s.resolve(review.id,'reviewed','Checked by owner');s.apply('test',[raw('PP Test Client',{location:''})]);assert.equal(s.reviews()[0].status,'reviewed');
 const file=await s.backup(join(dir,'recovery.sqlite'));const recovered=new DatabaseSync(file,{readOnly:true});assert.equal(recovered.prepare('SELECT COUNT(*) n FROM jobs').get()?.n,1);assert.equal(JSON.parse(String(recovered.prepare('SELECT payload FROM reviews').get()?.payload)).resolution,'Checked by owner');recovered.close();
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('tokens are authenticated encryption and production fails closed',()=>{
 const key=Buffer.alloc(32,7).toString('base64');const a=seal('private-token',key);assert.equal(unseal(a,key),'private-token');assert.notEqual(a,seal('private-token',key));const b=Buffer.from(a,'base64');b[b.length-1]^=1;assert.throws(()=>unseal(b.toString('base64'),key));
 const s=new Store(':memory:');try{assert.equal(signedIn({headers:{}} as any,s),false);assert.throws(()=>validateConfig());}finally{s.close();}
});
test('deadline assumptions stay provisional and honor an explicitly supplied holiday',()=>{
 assert.equal(deadline('2026-09-24T10:00:00-07:00',['Premium photo']).due,'2026-09-28');
 assert.equal(deadline('2026-09-24T10:00:00-07:00',['Premium photo'],['2026-09-28']).due,'2026-09-29');
 assert.ok(deadline('2026-09-21T10:00:00-07:00',['Basic photo']).deadlineBasis.includes('need approval'));
});
test('a new booking change reopens a previously reviewed change',()=>{
 const s=new Store(':memory:');try{s.apply('test',[raw()]);s.apply('test',[raw('PP Changed Client')]);const r=s.reviews().find(x=>x.kind==='Booking changed')!;s.resolve(r.id,'reviewed','Confirmed');s.apply('test',[raw('EP Changed Client')]);assert.equal(s.reviews().find(x=>x.id===r.id)?.status,'open');}finally{s.close();}
});
test('calendar failure preserves success time and does not prevent a backup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jfm-scheduler-'));const original=config.backupDir;config.backupDir=dir;const s=new Store(':memory:');
 try{s.setSetting('calendar-refresh','invalid-encrypted-token');s.setSync({id:'google-calendar',label:'Test',mode:'live',lastAttempt:null,lastSuccess:'2026-09-18T12:00:00Z',snapshotAt:null,error:null,count:3,syncToken:'old'});await scheduledTick(s);assert.equal(s.sync('google-calendar')?.lastSuccess,'2026-09-18T12:00:00Z');assert.equal(s.sync('google-calendar')?.syncToken,'old');assert.ok(s.sync('google-calendar')?.error);assert.ok(s.sync('backup')?.lastSuccess);}finally{s.close();config.backupDir=original;rmSync(dir,{recursive:true,force:true});}
});
test('cancelled recurrence exception without a start becomes a reviewable tombstone',()=>{
 const events=readICS('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:cancel-series\r\nRECURRENCE-ID:20260922T170000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR');assert.equal(events.length,1);assert.equal(events[0].status,'cancelled');assert.equal(events[0].start,'2026-09-22T17:00:00.000Z');
});
