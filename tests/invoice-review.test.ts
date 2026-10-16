import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverInvoiceDrafts,reviewItem,reviewPdf,reviewQueueWithToken} from '../server/invoice-review.ts';
import type {ReviewMapping} from '../server/invoice-review.ts';
import {Store} from '../server/store.ts';

const mapping:ReviewMapping={number:'12345',draftId:'r-test',threadId:'thread-1',draftMessageId:'draft-message'};
const pdf=Buffer.from('%PDF-1.7\ninvoice');
const draft={id:mapping.draftId,message:{id:'draft-message',threadId:mapping.threadId,payload:{headers:[{name:'Subject',value:'Re: Media delivery'},{name:'To',value:'client@example.com'},{name:'Cc',value:'accounts@example.com'}],parts:[{mimeType:'text/plain',body:{data:Buffer.from('Please review the invoice.').toString('base64url')}},{mimeType:'application/pdf',filename:'Invoice-12345.pdf',body:{attachmentId:'attachment-1'}}]}}};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
function mockFetch(current:unknown=draft):typeof fetch{return (async(input:RequestInfo|URL)=>{const url=String(input);if(url.includes('/drafts/'))return response(current,current?200:404);if(url.includes('/attachments/'))return response({data:pdf.toString('base64url')});if(url.includes('/threads/'))return response({messages:[{id:'delivery-1',threadId:'thread-1',labelIds:['SENT'],payload:{headers:[{name:'Subject',value:'Media delivery'},{name:'From',value:'info@jonathanfolk.ca'}]}}]});if(url.includes('/messages/delivery-1'))return response({id:'delivery-1',payload:{parts:[]}});throw new Error(`Unexpected URL: ${url}`);}) as typeof fetch;}

test('review reads the existing Gmail draft and its exact PDF without creating or editing anything',async()=>{
 const fetcher=mockFetch(),item=await reviewItem(mapping,'token',fetcher);
 assert.equal(item.state,'ready');assert.equal(item.to,'client@example.com');assert.equal(item.cc,'accounts@example.com');assert.equal(item.body,'Please review the invoice.');assert.equal(item.deliverySubject,'Media delivery');
 assert.ok(item.version);assert.deepEqual((await reviewPdf(mapping,'token',item.version!,fetcher)).bytes,pdf);
});
test('rotating Gmail attachment IDs keep an unchanged PDF version stable',async()=>{
 let reads=0;
 const fetcher:typeof fetch=async(input,options)=>{
  if(String(input).includes('/drafts/')){const current=structuredClone(draft);current.message.payload.parts[1].body.attachmentId=`rotating-${++reads}`;return response(current);}
  return mockFetch()(input,options);
 };
 const item=await reviewItem(mapping,'token',fetcher);
 assert.deepEqual((await reviewPdf(mapping,'token',item.version!,fetcher)).bytes,pdf);
 assert.equal(reads,2);
});
test('replacement PDF bytes invalidate a previously reviewed version',async()=>{
 let attachments=0;
 const fetcher:typeof fetch=async(input,options)=>String(input).includes('/attachments/')?response({data:Buffer.from(attachments++?'%PDF-new':'%PDF-old').toString('base64url')}):mockFetch()(input,options);
 const item=await reviewItem(mapping,'token',fetcher);
 await assert.rejects(reviewPdf(mapping,'token',item.version!,fetcher),/changed/);
});
test('stale PDF versions and changed threads are blocked',async()=>{
 const fetcher=mockFetch(),item=await reviewItem(mapping,'token',fetcher);
 await assert.rejects(reviewPdf(mapping,'token','0'.repeat(64),fetcher),/changed/);
 const moved=structuredClone(draft);moved.message.threadId='another-thread';
 assert.equal((await reviewItem(mapping,'token',mockFetch(moved))).state,'changed-thread');
 await assert.rejects(reviewPdf(mapping,'token',item.version!,mockFetch(moved)),/changed/);
});
test('mapped drafts with changed invoice PDFs or multiple PDFs need manual association',async()=>{
 const changed=structuredClone(draft);changed.message.payload.parts[1].filename='Invoice-12346.pdf';
 assert.equal((await reviewItem(mapping,'token',mockFetch(changed))).state,'needs-association');
 const multiple=structuredClone(draft);multiple.message.payload.parts.push({mimeType:'application/pdf',filename:'Invoice-12346.pdf',body:{attachmentId:'second'}});
 const item=await reviewItem(mapping,'token',mockFetch(multiple));assert.equal(item.state,'ambiguous');
 await assert.rejects(reviewPdf(mapping,'token',item.version!,mockFetch(multiple)),/exactly one PDF/);
});
test('missing drafts remain missing and cannot be recreated by the review path',async()=>{
 const fetcher=mockFetch(null),item=await reviewItem(mapping,'token',fetcher);
 assert.equal(item.state,'missing');assert.match(item.warning||'',/deleted or sent/);
 await assert.rejects(reviewPdf(mapping,'token','0'.repeat(64),fetcher),/changed/);
});

function invoiceDraft(id:string,number='12345',options:{body?:string;attachments?:string[];threadId?:string;labels?:string[]}={}){
 const filenames=options.attachments||[`Example Client - Invoice ${number} - Jonathan Folk Media.pdf`];
 return {id,message:{id:`message-${id}`,threadId:options.threadId||`thread-${id}`,labelIds:options.labels||['DRAFT'],payload:{headers:[{name:'Subject',value:'Re: Media Delivery 123 Example Street'},{name:'To',value:'client@example.test'}],parts:[{mimeType:'text/plain',body:{data:Buffer.from(options.body||'Invoice attached').toString('base64url')}},...filenames.map(filename=>({mimeType:'application/pdf',filename,body:{attachmentId:`attachment-${id}`}}))]}}};
}
function discoveryMock(drafts:Record<string,ReturnType<typeof invoiceDraft>>,pages:string[][],sentNumbers:string[]=[]){
 const calls:string[]=[];
 const fetcher:typeof fetch=async(input,options)=>{
  assert.ok(!options?.method||options.method==='GET');const url=new URL(String(input));calls.push(url.pathname+url.search);
  if(url.pathname.endsWith('/drafts')){assert.equal(url.searchParams.get('includeSpamTrash'),'false');assert.equal(url.searchParams.get('q'),'filename:pdf');const index=Number(url.searchParams.get('pageToken')||0);return response({drafts:(pages[index]||[]).map(id=>({id,message:{id:`message-${id}`,threadId:`thread-${id}`}})),nextPageToken:index+1<pages.length?String(index+1):undefined});}
  const draftMatch=url.pathname.match(/\/drafts\/([^/]+)$/);if(draftMatch)return response(drafts[draftMatch[1]]||null,drafts[draftMatch[1]]?200:404);
  const threadMatch=url.pathname.match(/\/threads\/([^/]+)$/);if(threadMatch){const id=threadMatch[1].replace(/^thread-/,'');const messages=[{id:`delivery-${id}`,threadId:threadMatch[1],labelIds:['SENT'],payload:{headers:[{name:'Subject',value:'Media Delivery 123 Example Street'},{name:'Message-ID',value:`<delivery-${id}@example.test>`}]}}];if(sentNumbers.includes(id))messages.push({id:`sent-${id}`,threadId:threadMatch[1],labelIds:['SENT'],payload:{headers:[{name:'Subject',value:'Re: Media Delivery 123 Example Street'}]}});return response({messages});}
  const sentMatch=url.pathname.match(/\/messages\/([^/]+)$/);if(sentMatch)return response({id:sentMatch[1],payload:{parts:sentMatch[1].startsWith('sent-')?[{mimeType:'application/pdf',filename:'Example Client - Invoice 12345 - Jonathan Folk Media.pdf'}]:[]}});
  if(url.pathname.includes('/attachments/'))return response({data:pdf.toString('base64url')});
  throw new Error(`Unexpected URL ${url.pathname}`);
 };
 return {fetcher,calls};
}

test('pagination finds only current recognizable JFM invoice drafts with verified delivery context',async()=>{
 const current={first:invoiceDraft('first'),unrelated:invoiceDraft('unrelated','12346',{attachments:['Other Company Invoice 12346.pdf']}),trashed:invoiceDraft('trashed','12347',{labels:['DRAFT','TRASH']}),second:invoiceDraft('second','12348')};
 const {fetcher,calls}=discoveryMock(current,[['first','unrelated'],['trashed','second']]);
 const result=await discoverInvoiceDrafts('token',new Set(),fetcher);
 assert.deepEqual(result.items.map(item=>item.number),['12345','12348']);assert.ok(result.items.every(item=>item.state==='ready'));
 assert.equal(result.incomplete,false);assert.ok(calls.some(call=>call.includes('pageToken=1')));
});

test('manual edits change the version; sent and deleted discovered drafts remain visible for review',async()=>{
 const store=new Store(':memory:');let current:Record<string,ReturnType<typeof invoiceDraft>>={one:invoiceDraft('one')},pages=[['one']],sent:string[]=[];
 try{
  let mocked=discoveryMock(current,pages,sent),first=await reviewQueueWithToken(store,'token',mocked.fetcher);
  assert.equal(first.items[0].state,'ready');const original=first.items[0].version;
  current={one:invoiceDraft('one','12345',{body:'Edited by user'})};mocked=discoveryMock(current,pages,sent);
  const edited=await reviewQueueWithToken(store,'token',mocked.fetcher);
  assert.notEqual(edited.items[0].version,original);assert.match(edited.items[0].warning||'',/edited/);
  current={one:invoiceDraft('one','12346')};mocked=discoveryMock(current,pages,sent);
  assert.equal((await reviewQueueWithToken(store,'token',mocked.fetcher)).items[0].state,'needs-association');
  current={};pages=[[]];sent=['one'];mocked=discoveryMock(current,pages,sent);
  const afterSend=await reviewQueueWithToken(store,'token',mocked.fetcher);
  assert.equal(afterSend.items[0].state,'possibly-sent');
  sent=[];mocked=discoveryMock(current,pages,sent);
  assert.equal((await reviewQueueWithToken(store,'token',mocked.fetcher)).items[0].state,'missing');
 }finally{store.close();}
});

test('multiple invoice attachments, duplicate numbers, and missing delivery association stay blocked',async()=>{
 const current={a:invoiceDraft('a'),b:invoiceDraft('b'),multi:invoiceDraft('multi','12349',{attachments:['Client - Invoice 12349 - Jonathan Folk Media.pdf','Client - Invoice 12350 - Jonathan Folk Media.pdf']}),unknown:invoiceDraft('unknown','DRAFT',{attachments:['Client - Invoice DRAFT - Jonathan Folk Media.pdf']})};
 const {fetcher}=discoveryMock(current,[Object.keys(current)]);
 const store=new Store(':memory:');try{const result=await reviewQueueWithToken(store,'token',fetcher);const byId=new Map(result.items.map(item=>[item.draftId,item]));assert.equal(byId.get('a')?.state,'ambiguous');assert.equal(byId.get('b')?.state,'ambiguous');assert.equal(byId.get('multi')?.state,'ambiguous');assert.equal(byId.get('unknown')?.state,'needs-association');}finally{store.close();}
});
test('mapped draft IDs are not rediscovered, and pagination limits fail closed',async()=>{
 const current:Record<string,ReturnType<typeof invoiceDraft>>={};const pages:string[][]=[];
 for(let index=0;index<11;index++){const id=`page-${index}`;current[id]=invoiceDraft(id,String(12360+index));pages.push([id]);}
 const {fetcher}=discoveryMock(current,pages);
 const skipped=await discoverInvoiceDrafts('token',new Set(['page-0']),fetcher);
 assert.equal(skipped.incomplete,true);assert.equal(skipped.items.length,9);assert.ok(!skipped.items.some(item=>item.draftId==='page-0'));
 const store=new Store(':memory:');try{const result=await reviewQueueWithToken(store,'token',fetcher);assert.equal(result.incomplete,true);assert.ok(result.items.every(item=>item.state==='needs-association'));}finally{store.close();}
});
test('a JFM invoice PDF without a verified media-delivery thread is shown for association',async()=>{
 const current={orphan:invoiceDraft('orphan')},mocked=discoveryMock(current,[['orphan']]);
 const fetcher:typeof fetch=async(input,options)=>String(input).includes('/threads/thread-orphan')?response({messages:[]}):mocked.fetcher(input,options);
 const result=await discoverInvoiceDrafts('token',new Set(),fetcher);
 assert.equal(result.items[0].state,'needs-association');assert.match(result.items[0].warning||'',/delivery/);
});
