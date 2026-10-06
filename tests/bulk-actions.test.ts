import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';
import {sheetCompletionMatches,type MasterRow} from '../server/completion.ts';
import {parseBooking} from '../server/parser.ts';

const event=(id:string,client:string,location:string)=>({id,title:`PP ${client}`,start:'2026-09-21T10:00:00-07:00',end:'2026-09-21T11:00:00-07:00',location});
const row=(row:number,client:string,notes:string):MasterRow=>({row,number:String(26000+row),client,date:'2026-09-25',totalCents:52500,paid:false,notes,orders:''});
const sheet=(rows:MasterRow[])=>({rows,spreadsheetId:'synthetic-sheet',gid:123,readAt:'2026-10-06T12:00:00Z'});

test('Sheet completion accepts unpaid invoices but rejects duplicate, partial and mismatched evidence',()=>{
 const job=parseBooking(event('one','Alpha Client','221-7377 Salisbury Ave'),'test')!,matched=row(7,'Alpha Client','7377 Salisbury Ave #221');
 assert.equal(sheetCompletionMatches([job],[matched]).length,1);
 assert.equal(sheetCompletionMatches([job],[matched,{...matched,row:8}]).length,0);
 assert.equal(sheetCompletionMatches([job],[{...matched,orders:'Deposit'}]).length,0);
 assert.equal(sheetCompletionMatches([job],[{...matched,notes:'7377 Salisbury Ave #222'}]).length,0);
 assert.equal(sheetCompletionMatches([{...job,status:'Unconfirmed'}],[matched]).length,0);
});

test('bulk completion requires a unique live Sheet match for every selected shoot and preserves drafts',()=>{
 const store=new Store(':memory:');try{
  store.apply('test',[event('one','Alpha Client','221-7377 Salisbury Ave'),event('two','Beta Client','300 Main St')]);
  const [alpha,beta]=store.jobs().sort((a,b)=>a.client.localeCompare(b.client));
  store.review({id:'alpha-review',kind:'Check booking',title:'Alpha',detail:'',jobId:alpha.id,source:'test',status:'open',updatedAt:'2026-10-06'});
  store.review({id:'beta-review',kind:'Check booking',title:'Beta',detail:'',jobId:beta.id,source:'test',status:'open',updatedAt:'2026-10-06'});
  const invoice=store.createInvoice(alpha.id,true),before=store.invoices();
  const alphaRow=row(7,'Alpha Client','7377 Salisbury Ave #221');
  assert.throws(()=>store.bulkComplete('reviews',['alpha-review','beta-review'],sheet([alphaRow])),/Nothing was moved/);
  assert.equal(store.completions().length,0);
  assert.equal(store.bulkComplete('reviews',['alpha-review'],sheet([alphaRow])),1);
  assert.equal(store.completions()[0].row.number,alphaRow.number);
  assert.equal(store.completions()[0].row.paid,false);
  assert.deepEqual(store.invoices(),before);
  assert.throws(()=>store.bulkComplete('invoices',[invoice.id],sheet([alphaRow])),/no active shoot/);
 }finally{store.close();}
});

test('bulk delete validates the whole selection before moving items and supports restore',()=>{
 const store=new Store(':memory:');try{
  store.apply('test',[event('one','Alpha Client','221-7377 Salisbury Ave')]);
  const job=store.jobs()[0],invoice=store.createInvoice(job.id,true);
  store.review({id:'one-review',kind:'Check booking',title:'Alpha',detail:'',jobId:job.id,source:'test',status:'open',updatedAt:'2026-10-06'});
  assert.throws(()=>store.bulkDelete('reviews',['one-review','missing']),/no longer available/);
  assert.equal(store.deletedItems().length,0);
  assert.equal(store.bulkDelete('reviews',['one-review']),1);
  assert.equal(store.deletedItems().length,1);
  store.restoreReview('one-review');
  assert.equal(store.bulkDelete('invoices',[invoice.id]),1);
  assert.equal(store.deletedItems()[0].jobId,job.id);
  assert.equal(store.invoices().length,1);
 }finally{store.close();}
});
