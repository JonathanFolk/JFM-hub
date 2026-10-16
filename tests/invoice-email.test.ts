import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {prepareInvoiceEmail,createInvoiceEmailDraft,initializeInvoiceEmailDrafts,invoicePdfFilename} from '../server/invoice-email.ts';
import {normalizeInvoiceInput} from '../server/invoicing.ts';
import type {InvoiceDraft} from '../server/types.ts';
const invoice=():InvoiceDraft=>({...normalizeInvoiceInput({client:'Synthetic Client PREC*',property:'123 Example Street',invoiceDate:'2026-10-15',dueDate:'2026-11-14',pdfDetails:{reference:'26098a',filenameClient:'Synthetic Client',billTo:'Test',business:'Example Media',paymentNote:'Net30'},lines:[{id:'one',description:'Photos',quantity:1,unitPriceCents:35000}]}),id:'invoice-test',jobId:'job-test',createdAt:'2026-10-15',updatedAt:'2026-10-15'});
const template={html:'',subject:'New Invoice ____ - Jonathan Folk Media',body:'Hi ___!\n\nSee attached for the invoice for the recent assignment at _____! Please fulfill the invoice in net ____ fashion.\n\nLet me know if you have any questions!\n\nThanks!\n\n---\n\nSynthetic Sender\nExample Photographer\nhttps://example.test\nsender@example.test'};
template.html='<div>Hi ___!</div><p>See attached for the invoice for the recent assignment at _____! Please fulfill the invoice in net ____ fashion.</p><b>Synthetic Sender</b><a href="https://example.test">Example</a>';
const details={to:['client@example.test'],cc:[],greetingName:'Alex'};
const prepared=()=>prepareInvoiceEmail(invoice(),details,template,Buffer.from('%PDF-test'),'sender@example.test');
test('invoice email fills verified blanks and preserves exact filename/reference letters',()=>{
 const value=prepared();assert.equal(value.subject,'New Invoice 26098a - Jonathan Folk Media');assert.equal(value.filename,'Synthetic Client - Invoice 26098a - Jonathan Folk Media.pdf');assert.ok(value.body.startsWith('Hi Alex!'));assert.ok(value.body.includes('assignment at 123 Example Street!'));assert.ok(value.body.includes('net 30 fashion.'));assert.ok(value.body.endsWith('sender@example.test'));const raw=Buffer.from(value.raw,'base64url').toString();assert.ok(raw.includes('Content-Type: application/pdf'));assert.ok(raw.includes(Buffer.from('%PDF-test').toString('base64')));assert.ok(!raw.includes('Bcc:'));
});
test('team greeting counts unique intended To/Cc contacts, excluding self',()=>{
 const make=(to:string[],cc:string[])=>prepareInvoiceEmail(invoice(),{to,cc,greetingName:'Alex'},template,Buffer.from('%PDF-test'),'sender@example.test');assert.ok(make(['client@example.test'],['second@example.test']).body.startsWith('Hi team!'));assert.ok(make(['client@example.test'],['CLIENT@example.test','sender@example.test']).body.startsWith('Hi Alex!'));assert.throws(()=>make(['sender@example.test'],[]),/intended client/);
});
test('reject header injection, invalid input, missing template placeholders and missing reference',()=>{
 assert.throws(()=>prepareInvoiceEmail(invoice(),{...details,to:['client@example.test\r\nBcc:evil@example.test']},template,Buffer.from('%PDF-test'),'sender@example.test'),/valid recipient/);assert.throws(()=>prepareInvoiceEmail({...invoice(),pdfDetails:{...invoice().pdfDetails!,reference:''}},details,template,Buffer.from('%PDF-test'),'sender@example.test'),/reference/);assert.throws(()=>prepareInvoiceEmail(invoice(),details,{...template,body:'unknown'},Buffer.from('%PDF-test'),'sender@example.test'),/verified invoice template/);assert.ok(!invoicePdfFilename({...invoice(),client:'../Bad\\Name',pdfDetails:undefined}).includes('/'));
});
test('same semantic invoice remains idempotent after autosave timestamps/private notes change',()=>{
 const initial=prepared();const changed=prepareInvoiceEmail({...invoice(),updatedAt:'tomorrow',notes:'New private note'},details,template,Buffer.from('%PDF-different-creation-date'),'sender@example.test');assert.equal(initial.fingerprint,changed.fingerprint);
});
test('create calls only Gmail drafts, persists response, and refuses duplicates or changed copies',async()=>{
 const db=new DatabaseSync(':memory:');initializeInvoiceEmailDrafts(db);let calls=0;const fetcher:typeof fetch=async(url,options)=>{if(options?.method==='POST'){calls++;assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/drafts');}else assert.ok(String(url).includes('/drafts/draft-one?format=minimal'));return Response.json({id:'draft-one',message:{id:'message-one'}});};
 try{const first=await createInvoiceEmailDraft(db,'invoice-test',prepared(),'synthetic-token',fetcher);assert.equal(first.reused,false);const second=await createInvoiceEmailDraft(db,'invoice-test',prepared(),'synthetic-token',fetcher);assert.equal(second.reused,true);assert.equal(calls,1);await assert.rejects(()=>createInvoiceEmailDraft(db,'invoice-test',{...prepared(),fingerprint:'changed'},'synthetic-token',fetcher),/already exists/);assert.equal(calls,1);}finally{db.close();}
});
test('concurrent calls and uncertain results never repeat a Gmail creation request',async()=>{
 const db=new DatabaseSync(':memory:');initializeInvoiceEmailDrafts(db);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let calls=0;const fetcher:typeof fetch=async()=>{calls++;await gate;throw new Error('timeout');};try{const first=createInvoiceEmailDraft(db,'invoice-test',prepared(),'test',fetcher);await assert.rejects(()=>createInvoiceEmailDraft(db,'invoice-test',prepared(),'test',fetcher),/earlier draft attempt/);release();await assert.rejects(()=>first,/did not confirm/);await assert.rejects(()=>createInvoiceEmailDraft(db,'invoice-test',prepared(),'test',fetcher),/earlier draft attempt/);assert.equal(calls,1);}finally{db.close();}
});
test('no application module implements a Gmail send endpoint',()=>{
 const source=readFileSync('server/invoice-email.ts','utf8');assert.ok(!/messages\/send|drafts\/send/.test(source));assert.ok(source.includes('/users/me/drafts'));
});
test('a sent or deleted Gmail draft is never silently recreated',async()=>{
 const db=new DatabaseSync(':memory:');initializeInvoiceEmailDrafts(db);try{await createInvoiceEmailDraft(db,'invoice-test',prepared(),'test',async()=>Response.json({id:'draft-one',message:{id:'message-one'}}));let calls=0;await assert.rejects(()=>createInvoiceEmailDraft(db,'invoice-test',prepared(),'test',async(_url,options)=>{calls++;assert.notEqual(options?.method,'POST');return new Response('',{status:404});}),/may have been sent or deleted/);assert.equal(calls,1);}finally{db.close();}
});

test('HTML preserves signature markup and escapes variable text literally',()=>{const value=prepareInvoiceEmail({...invoice(),property:'A & B <Place> $&'}, {...details,greetingName:'A & B'},template,Buffer.from('%PDF-test'),'sender@example.test');assert.ok(value.html.includes('A &amp; B &lt;Place&gt; $&'));assert.ok(value.body.includes('A & B <Place> $&'));assert.ok(value.html.includes('<b>Synthetic Sender</b>'));assert.ok(Buffer.from(value.raw,'base64url').toString().includes('multipart/alternative'));});

test('definite Gmail rejection permits a new explicit attempt without automatic retries',async()=>{const db=new DatabaseSync(':memory:');initializeInvoiceEmailDrafts(db);let calls=0;try{await assert.rejects(()=>createInvoiceEmailDraft(db,'invoice-test',prepared(),'test',async()=>{calls++;return Response.json({error:'denied'},{status:403});}),/Gmail rejected/);assert.equal(calls,1);const result=await createInvoiceEmailDraft(db,'invoice-test',prepared(),'test',async()=>{calls++;return Response.json({id:'draft-two',message:{id:'message-two'}});});assert.equal(result.draftId,'draft-two');assert.equal(calls,2);}finally{db.close();}});

test('long MIME headers are folded and encoded words stay within RFC limits',()=>{const value=prepareInvoiceEmail({...invoice(),client:'É'.repeat(120),pdfDetails:{...invoice().pdfDetails!,filenameClient:'É'.repeat(120),reference:'É'.repeat(40)}},{...details,to:Array.from({length:20},(_,i)=>`client${i}${'a'.repeat(200)}@example.test`)},template,Buffer.from('%PDF-test'),'sender@example.test');const raw=Buffer.from(value.raw,'base64url').toString();assert.ok(raw.split('\r\n').every(line=>Buffer.byteLength(line)<=998));assert.ok((raw.match(/=\?UTF-8\?B\?[^?]+\?=/g)||[]).every(word=>word.length<=75));assert.ok(raw.includes('filename*0*='));});
