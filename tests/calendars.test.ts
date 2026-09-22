import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';
import {validateSources,sourceId,currentJobs,ensureCalendarSources} from '../server/calendar-sources.ts';
import {refreshCalendars,type SyncDependencies} from '../server/sync.ts';
import {parseBooking} from '../server/parser.ts';
const sources=validateSources([{key:'primary',calendarId:'owner@example.com',label:'Owner'},{key:'george',calendarId:'contractor@example.com',label:'George',contractor:'George'}]);
const event=(id:string,title:string)=>({id,title,start:'2026-09-22T17:00:00Z',end:'2026-09-22T18:00:00Z',location:'Synthetic property'});
test('only explicit calendars are allowed; secondary calendars cannot bypass For J',()=>{
 assert.throws(()=>validateSources([{key:'primary',calendarId:'one',label:'Owner'},{key:'other',calendarId:'two',label:'Other'}]),/For J/);
 assert.throws(()=>validateSources([...sources,sources[0]]),/duplicate/);
 const s=new Store(':memory:');try{ensureCalendarSources(s,sources);assert.equal(s.syncs().length,2);assert.equal(s.sync(sourceId(sources[1]))?.mode,'not-connected');}finally{s.close();}
});
test('each calendar has independent IDs/cursors and repeated multi-calendar sync is idempotent',async()=>{
 const s=new Store(':memory:');let tokens=0;const calls:string[]=[];
 const deps:SyncDependencies={token:async()=>{tokens++;return 'fake';},collect:async(_token,id,cursor)=>{calls.push(id+':'+(cursor||''));return {events:id===sources[0].calendarId?[event('same-id','PP Synthetic Client')]:[event('same-id','George PP For J with Synthetic Client'),event('unrelated','George PP with Other Client')],syncToken:id+'-cursor',full:!cursor};}};
 try{await refreshCalendars(s,sources,deps);assert.equal(tokens,1);assert.equal(s.jobs().length,2);assert.equal(currentJobs(s,sources).length,2);assert.notEqual(s.jobs()[0].id,s.jobs()[1].id);assert.equal((await refreshCalendars(s,sources,deps)).changed,0);assert.ok(calls.includes('contractor@example.com:contractor@example.com-cursor'));}finally{s.close();}
});
test('one calendar failing does not block another or advance the failed success time',async()=>{
 const s=new Store(':memory:');s.setSync({id:'google-calendar',label:'Owner',mode:'live',lastAttempt:null,lastSuccess:'2026-09-18T10:00:00Z',snapshotAt:null,error:null,count:0,syncToken:'keep'});
 const deps:SyncDependencies={token:async()=> 'fake',collect:async(_token,id)=>{if(id===sources[0].calendarId)throw new Error('Unavailable');return {events:[event('g','George PP For J with Synthetic Client')],syncToken:'new',full:true};}};
 try{await assert.rejects(refreshCalendars(s,sources,deps),/Some calendars/);assert.equal(s.sync('google-calendar')?.lastSuccess,'2026-09-18T10:00:00Z');assert.equal(s.sync('google-calendar')?.syncToken,'keep');assert.ok(s.sync('google-calendar-george')?.lastSuccess);assert.equal(currentJobs(s,sources).length,1);}finally{s.close();}
});
test('titleless contractor cancellation preserves the prior authorized booking',()=>{
 const old=parseBooking(event('g','George PP For J with Synthetic Client'),'g',undefined,'George')!;
 const cancelled=parseBooking({...event('g',''),status:'cancelled',start:'',end:''},'g',old,'George');
 assert.equal(cancelled?.status,'Cancelled');assert.equal(cancelled?.client,'Synthetic Client');
 assert.equal(parseBooking(event('other','George PP with Other Client'),'g',undefined,'George'),null);
});
test('unknown For J naming is held for review instead of silently losing a JFM request',()=>{
 const j=parseBooking(event('g','Unknown operator CUSTOM For J with Synthetic Client'),'g',undefined,'3D Elevate');
 assert.equal(j?.status,'Needs review');assert.equal(j?.client,'Synthetic Client');assert.equal(j?.due,null);
 const missing=parseBooking(event('g','George PP For J'),'g',undefined,'George');assert.equal(missing?.client,'');assert.equal(missing?.status,'Needs review');
});
