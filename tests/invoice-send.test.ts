import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';
import {prepareInvoiceSend,sendPreparedInvoice} from '../server/invoice-send.ts';
import type {ReviewItem} from '../server/invoice-review.ts';

const item:ReviewItem={number:'12345',draftId:'r-example',threadId:'delivery-thread',messageId:'draft-message',state:'ready',version:'a'.repeat(64),subject:'Re: Media delivery',to:'client@example.test',cc:'accounts@example.test',bcc:'owner@example.test',body:'Please find the invoice attached.',filename:'Invoice-12345.pdf',deliverySubject:'Media delivery',attachment:true,gmailUrl:'https://mail.google.com/',source:'mapped'};
const input=(confirmation:{number:string;draftId:string;version:string;confirmationId:string})=>({number:confirmation.number,draftId:confirmation.draftId,version:confirmation.version,confirmationId:confirmation.confirmationId});

test('sends only the existing confirmed Gmail draft ID, once, in its original thread',async()=>{
 const store=new Store(':memory:');try{
  const confirmation=prepareInvoiceSend(store,item);assert.equal(confirmation.bcc,'owner@example.test');let calls=0;
  const fetcher:typeof fetch=async(url,options)=>{calls++;assert.equal(String(url),'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send');assert.equal(options?.method,'POST');assert.deepEqual(JSON.parse(String(options?.body)),{id:'r-example'});return new Response(JSON.stringify({id:'sent-message',threadId:'delivery-thread'}),{status:200});};
  const result=await sendPreparedInvoice(store,input(confirmation),async()=>item,async()=> 'compose-token',fetcher);
  assert.deepEqual(result,{sent:true,messageId:'sent-message',threadId:'delivery-thread'});assert.equal(calls,1);
  await assert.rejects(sendPreparedInvoice(store,input(confirmation),async()=>item,async()=> 'compose-token',fetcher),/already used/);
  assert.throws(()=>prepareInvoiceSend(store,item),/already has a send attempt/);assert.equal(calls,1);
 }finally{store.close();}
});

test('changed recipients or PDF version after confirmation block send before Gmail POST',async()=>{
 const store=new Store(':memory:');try{
  const confirmation=prepareInvoiceSend(store,item);let calls=0;
  const fetcher:typeof fetch=async()=>{calls++;throw new Error('must not send');};
  await assert.rejects(sendPreparedInvoice(store,input(confirmation),async()=>({...item,to:'other@example.test',version:'b'.repeat(64)}),async()=> 'compose-token',fetcher),/changed/);
  assert.equal(calls,0);assert.equal((store.db.prepare('SELECT status FROM invoice_review_sends WHERE draft_id=?').get(item.draftId) as {status:string}).status,'blocked');
  assert.ok(prepareInvoiceSend(store,{...item,version:'b'.repeat(64)}).confirmationId);
 }finally{store.close();}
});

test('ambiguous association and unresolved review changes cannot be prepared',()=>{
 const store=new Store(':memory:');try{
  assert.throws(()=>prepareInvoiceSend(store,{...item,state:'needs-association'}),/needs review/);
  assert.throws(()=>prepareInvoiceSend(store,{...item,deliverySubject:''}),/needs review/);
  assert.throws(()=>prepareInvoiceSend(store,{...item,otherAttachments:true}),/another attachment/);
  assert.throws(()=>prepareInvoiceSend(store,{...item,bodyTruncated:true}),/too long/);
  store.db.prepare('INSERT INTO invoice_review_notes VALUES(?,?,?,?)').run(item.number,item.version!,'Correct the total',new Date().toISOString());
  assert.throws(()=>prepareInvoiceSend(store,item),/Changes were requested/);
 }finally{store.close();}
});

test('uncertain Gmail response blocks retries and never claims sent',async()=>{
 const store=new Store(':memory:');try{
  const confirmation=prepareInvoiceSend(store,item);let calls=0;
  const fetcher:typeof fetch=async()=>{calls++;throw new Error('connection closed after request');};
  await assert.rejects(sendPreparedInvoice(store,input(confirmation),async()=>item,async()=> 'compose-token',fetcher),/outcome is uncertain/);
  assert.equal(calls,1);assert.equal((store.db.prepare('SELECT status FROM invoice_review_sends WHERE draft_id=?').get(item.draftId) as {status:string}).status,'uncertain');
  assert.throws(()=>prepareInvoiceSend(store,item),/already has a send attempt/);
  await assert.rejects(sendPreparedInvoice(store,input(confirmation),async()=>item,async()=> 'compose-token',fetcher),/already used/);assert.equal(calls,1);
 }finally{store.close();}
});

test('simultaneous button presses cannot issue two Gmail sends',async()=>{
 const store=new Store(':memory:');try{
  const confirmation=prepareInvoiceSend(store,item);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let calls=0;
  const fetcher:typeof fetch=async()=>{calls++;await gate;return new Response(JSON.stringify({id:'sent-message',threadId:'delivery-thread'}),{status:200});};
  const first=sendPreparedInvoice(store,input(confirmation),async()=>item,async()=> 'compose-token',fetcher);
  await assert.rejects(sendPreparedInvoice(store,input(confirmation),async()=>item,async()=> 'compose-token',fetcher),/already used/);
  release();await first;assert.equal(calls,1);
 }finally{store.close();}
});
