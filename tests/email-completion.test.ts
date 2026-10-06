import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBooking} from '../server/parser.ts';
import {auditedProjectCompletions,type AuditedProject} from '../server/email-completion.ts';
import type {MasterRow} from '../server/completion.ts';
const now=new Date('2026-09-27T12:00:00Z');
const job=parseBooking({id:'photo',title:'PS Test Client',start:'2026-08-01T10:00:00-07:00',end:'2026-08-01T11:00:00-07:00',location:'123 Test St'},'test')!;
const row:MasterRow={row:7,number:'26001a',client:'Test Client',date:'2026-08-05',totalCents:36750,paid:true,notes:'Test',orders:''};
const project:AuditedProject={jobIds:[job.id,'video'],sheetRows:[7,8],invoiceNumbers:['26001a','26001b'],project:'123 Test St',basis:'Reviewed delivery and invoice thread; both split invoices paid.',emails:[{threadId:'thread',messageId:'message',subject:'Media delivery for 123 Test St'}]};
const rows=[row,{...row,row:8,number:'26001b'}];
const jobs=[job,{...job,id:'video',title:'PV for J with Test Client'}];
test('an explicitly audited paid project covers multiple service bookings and split invoices',()=>{
 const matches=auditedProjectCompletions([project],jobs,rows,now);
 assert.equal(matches.length,2);assert.equal(matches[0].evidence.rows.length,2);
 assert.equal(matches[1].evidence.emails[0].messageId,'message');
 assert.equal(job.status,'Booked');
});
test('unpaid, missing or changed invoice evidence fails closed',()=>{
 assert.throws(()=>auditedProjectCompletions([project],jobs,[row,{...rows[1],paid:false}],now),/not paid/);
 assert.throws(()=>auditedProjectCompletions([project],jobs,[row],now),/missing/);
 assert.throws(()=>auditedProjectCompletions([project],jobs,[row,{...rows[1],number:'different'}],now),/changed/);
 assert.throws(()=>auditedProjectCompletions([{...project,emails:[]}],jobs,rows,now),/Incomplete/);
});
test('cancelled/future jobs and ambiguous mappings remain protected',()=>{
 assert.throws(()=>auditedProjectCompletions([project],[{...job,status:'Cancelled'},jobs[1]],rows,now),/cancelled/);
 assert.throws(()=>auditedProjectCompletions([project],[{...job,start:'2026-10-01'},jobs[1]],rows,now),/future/);
 assert.throws(()=>auditedProjectCompletions([project,project],jobs,rows,now),/Conflicting/);
 assert.throws(()=>auditedProjectCompletions([project],jobs,rows.map(r=>({...r,date:'2026-07-01'})),now),/predate/);
});
