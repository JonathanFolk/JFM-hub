import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGmailReader} from '../server/gmail-reader.ts';
import {syncInvoiceEvidence} from '../server/reconciliation.ts';
import {Store} from '../server/store.ts';

const failure=(reason:string,status=403,headers?:Record<string,string>)=>Response.json({error:{message:'private provider detail',errors:[{reason}]}},{status,headers});
function reader(responses:Response[]){let time=0;const calls:number[]=[],waits:number[]=[];return {calls,waits,get:createGmailReader('fake',{fetcher:(async()=>{calls.push(time);const response=responses.shift();assert.ok(response);return response;}) as typeof fetch,now:()=>time,random:()=>0,sleep:async ms=>{waits.push(ms);time+=ms;}})};}
test('Gmail requests are paced and rate-limit retries back off without leaking raw errors',async()=>{
 const r=reader([failure('rateLimitExceeded'),failure('userRateLimitExceeded'),Response.json({ok:true}),Response.json({ok:true})]);
 await r.get('profile');await r.get('profile');assert.deepEqual(r.calls,[0,2000,6000,7000]);
 const exhausted=reader(Array.from({length:4},()=>failure('rateLimitExceeded')));
 await assert.rejects(exhausted.get('profile'),e=>e instanceof Error&&/rate-limiting.*Progress is saved/.test(e.message)&&!e.message.includes('private'));
 assert.equal(exhausted.calls.length,4);
});
test('Gmail honors Retry-After, retries transient errors and does not retry permissions',async()=>{
 const r=reader([failure('quota',429,{'Retry-After':'5'}),failure('backendError',503),Response.json({})]);await r.get('profile');assert.deepEqual(r.calls,[0,5000,9000]);
 const long=reader([failure('quota',429,{'Retry-After':'120'})]);await assert.rejects(long.get('profile'),/rate-limiting/);assert.equal(long.calls.length,1);
 for(const [reason,expected] of [['insufficientPermissions',/read-only permission/],['domainPolicy',/Workspace policy/],['SERVICE_DISABLED',/API is disabled/]] as const){const denied=reader([failure(reason)]);await assert.rejects(denied.get('profile'),expected);assert.equal(denied.calls.length,1);}
});
const message=(id:string)=>({id,threadId:'thread-'+id,labelIds:['SENT'],payload:{mimeType:'text/plain',headers:[{name:'Subject',value:'Invoice 26001'}],body:{data:Buffer.from('Invoice 26001 for $105.00 CAD').toString('base64url')}}});
function setup(){const s=new Store(':memory:');s.setSetting('gmail-refresh','fake');s.setSetting('sheets-refresh','fake');return s;}
const sheet=async()=>[{row:7,number:'26001',client:'Test',totalCents:10500,paid:false,notes:''}];
function dependencies(get:(path:string)=>Promise<any>,batchSize=2){return {token:async()=> 'fake',sheet,reader:()=>get,batchSize};}
test('scan checkpoints survive pauses, never advance the cursor early and preserve review decisions',async()=>{
 const s=setup(),calls:string[]=[];
 const get=async(path:string)=>{calls.push(path);if(path==='profile')return {historyId:'start-cursor'};if(path.startsWith('messages?'))return {messages:['a','b','c'].map(id=>({id}))};return message(path.split('/')[1].split('?')[0]);};
 try{
  const first=await syncInvoiceEvidence(s,false,dependencies(get));assert.equal(first.remaining,1);assert.equal(first.scanned,2);assert.equal(s.getSetting('reconciliation-history-id'),undefined);assert.equal(s.sync('invoice-reconciliation')?.lastSuccess,null);
  const suggestion=s.reconciliationSuggestions()[0];s.resolveReconciliationSuggestion(suggestion.id,'confirmed','Keep this decision');
  const final=await syncInvoiceEvidence(s,true,dependencies(get));assert.equal(final.remaining,0);assert.equal(final.scanned,3);assert.equal(final.created,3);assert.equal(s.getSetting('reconciliation-history-id'),'start-cursor');assert.equal(s.getSetting('reconciliation-pending-v1'),undefined);assert.ok(s.sync('invoice-reconciliation')?.lastSuccess);
  assert.equal(calls.filter(p=>p==='profile').length,1);assert.equal(calls.filter(p=>p.startsWith('messages/a?')).length,1);assert.equal(s.reconciliationSuggestions().find(r=>r.id===suggestion.id)?.status,'confirmed');
 }finally{s.close();}
});
test('a mid-scan failure resumes the failed message, not already completed messages',async()=>{
 const s=setup();let blocked=true;const calls:string[]=[];
 const get=async(path:string)=>{calls.push(path);if(path==='profile')return {historyId:'new'};if(path.startsWith('messages?'))return {messages:[{id:'a'},{id:'b'}]};if(path.startsWith('messages/b?')&&blocked)throw Object.assign(new Error('Gmail is temporarily rate-limiting this scan.'),{status:403});return message('a');};
 try{await assert.rejects(syncInvoiceEvidence(s,false,dependencies(get)),/rate-limiting/);assert.equal(JSON.parse(s.getSetting('reconciliation-pending-v1')!).index,1);assert.equal(s.getSetting('reconciliation-history-id'),undefined);blocked=false;await syncInvoiceEvidence(s,false,dependencies(get));assert.equal(calls.filter(p=>p.startsWith('messages/a?')).length,1);assert.equal(s.getSetting('reconciliation-history-id'),'new');}finally{s.close();}
});
test('incremental pages deduplicate messages, skip deleted messages and keep cursor on failed discovery',async()=>{
 const s=setup();s.setSetting('reconciliation-history-id','old');let pages=0;
 const get=async(path:string)=>{if(path.startsWith('history?')){pages++;return {historyId:'new',history:[{messagesAdded:[{message:{id:'a'}}]}],...(pages===1?{nextPageToken:'next'}:{})};}throw Object.assign(new Error('Gone'),{status:404});};
 try{const result=await syncInvoiceEvidence(s,false,dependencies(get));assert.equal(result.scanned,1);assert.equal(s.getSetting('reconciliation-history-id'),'new');assert.equal(pages,2);
 await assert.rejects(syncInvoiceEvidence(s,false,dependencies(async()=>{throw Object.assign(new Error('Expired'),{status:404});})),/history expired/);assert.equal(s.getSetting('reconciliation-history-id'),'new');assert.equal(s.getSetting('reconciliation-pending-v1'),undefined);
 }finally{s.close();}
});
test('evidence and checkpoint updates roll back together on database failure',async()=>{
 const s=setup();const get=async(path:string)=>path==='profile'?{historyId:'new'}:path.startsWith('messages?')?{messages:[{id:'a'}]}:message('a');
 try{s.db.exec("CREATE TRIGGER fail_checkpoint BEFORE INSERT ON settings WHEN NEW.key='reconciliation-pending-v1' AND json_extract(NEW.value,'$.index')=1 BEGIN SELECT RAISE(ABORT, 'test checkpoint failure'); END");await assert.rejects(syncInvoiceEvidence(s,false,dependencies(get)),/test checkpoint failure/);assert.equal(s.reconciliationSuggestions().length,0);assert.equal(JSON.parse(s.getSetting('reconciliation-pending-v1')!).index,0);assert.equal(s.getSetting('reconciliation-history-id'),undefined);}finally{s.close();}
});
