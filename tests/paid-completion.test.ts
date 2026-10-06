import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DateTime} from 'luxon';
import {parseBooking} from '../server/parser.ts';
import {completionAddress,paidCompletionMatches,type MasterRow} from '../server/completion.ts';
const now=DateTime.fromISO('2026-09-27');
const job=parseBooking({id:'one',title:'PS Test Client',start:'2026-08-01T10:00:00-07:00',end:'2026-08-01T11:00:00-07:00',location:'7377 Salisbury Avenue #221, Burnaby, BC, Canada'},'test')!;
const row:MasterRow={row:7,number:'26001',client:'Test Client',date:'2026-08-05',totalCents:36750,paid:true,notes:'221-7377 Salisbury Ave',orders:''};
test('paid matching normalizes unit placement and city formatting without losing identity',()=>{
 for(const [a,b] of [['7377 Salisbury Avenue #221, Burnaby','221-7377 Salisbury Ave'],['Unit 221, 7377 Salisbury Avenue','221 7377 Salisbury Ave'],['2888 Cambie St. unit 225','225-2888 Cambie St'],['122 8th Ave unit 1, New Westminster','1-122 8th Ave'],['4 3874 Winlake Cres Burnaby','3874 Winlake Cres #4']])assert.equal(completionAddress(a)?.key,completionAddress(b)?.key,a);
 assert.equal(paidCompletionMatches([job],[row],now).length,1);
 for(const notes of ['7377 Salisbury Ave','222-7377 Salisbury Ave','221-7378 Salisbury Ave','Salisbury Ave','Burnaby',''])assert.equal(paidCompletionMatches([job],[{...row,notes}],now).length,0,notes);
});
test('paid completion rejects unpaid, partial, duplicate, future and competing matches',()=>{
 assert.equal(paidCompletionMatches([job],[{...row,paid:false}],now).length,0);
 for(const orders of ['PARTIAL PAID','Deposit','ERROR Rebill','Relicensing'])assert.equal(paidCompletionMatches([job],[{...row,orders}],now).length,0);
 assert.equal(paidCompletionMatches([job],[row,{...row,row:8,paid:false}],now).length,0);
 assert.equal(paidCompletionMatches([job,{...job,id:'two'}],[row],now).length,0);
 assert.equal(paidCompletionMatches([job,{...job,id:'cancelled-visit',status:'Cancelled'}],[row],now).length,0);
 assert.equal(paidCompletionMatches([job],[{...row,date:'2026-07-31'}],now).length,0);
 assert.equal(paidCompletionMatches([job],[{...row,date:'2026-12-01'}],now).length,0);
 assert.equal(paidCompletionMatches([{...job,start:'2026-10-01T10:00:00Z'}],[row],now).length,0);
 assert.equal(paidCompletionMatches([{...job,status:'Cancelled'}],[row],now).length,0);
});
