import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {DateTime} from 'luxon';
import {parseBooking,deadline} from '../server/parser.ts';
import {Store} from '../server/store.ts';
import {readICS,collectGoogleEvents} from '../server/calendar.ts';
import {seal,unseal,signedIn} from '../server/auth.ts';
import {config,validateConfig,validEncryptionKey} from '../server/config.ts';
import {dailyBackup,scheduledTick} from '../server/sync.ts';
import type {RawEvent} from '../server/types.ts';
import {invoiceTotals,normalizeInvoiceInput,validateInvoiceDraft} from '../server/invoicing.ts';
import {customPricePrompts,normalizeRate,rateSuggestions} from '../server/rates.ts';
import {extractEmailPrices} from '../server/gmail.ts';
import {currentJobs} from '../server/calendar-sources.ts';
import {referenceForClient,pricingQuestions} from '../server/reference.ts';
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
 assert.equal(j.client,'Test Client');assert.equal(j.status,'Unconfirmed');assert.equal(j.due,null);
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
test('full Google synchronization uses fourteen days back and six months forward',async()=>{
 let request='';const fetcher=(async(url:any)=>{request=String(url);return Response.json({items:[],nextSyncToken:'cursor'});}) as typeof fetch;
 await collectGoogleEvents('secret','primary',undefined,fetcher,DateTime.fromISO('2031-09-25T12:00:00-07:00') as DateTime<true>);
 const url=new URL(request);assert.ok(url.searchParams.get('timeMin')?.startsWith('2031-09-11'));assert.ok(url.searchParams.get('timeMax')?.startsWith('2032-03-25'));
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
test('review decisions may be saved without a note and do not delete records',()=>{
 const s=new Store(':memory:');try{
  s.review({id:'optional-note',kind:'Check booking',title:'Test',detail:'Check',jobId:null,source:'test',status:'open',updatedAt:new Date().toISOString()});
  s.resolve('optional-note','dismissed','');
  assert.equal(s.reviews().length,1);assert.equal(s.reviews()[0].status,'dismissed');assert.equal(s.reviews()[0].resolution,'');
 }finally{s.close();}
});
test('sorting a shoot survives reimport and starts a private invoice draft',()=>{
 const s=new Store(':memory:');try{
  s.apply('google-calendar',[raw('PP Client With Missing Property',{location:''})]);
  const review=s.reviews().find(item=>item.jobId===s.jobs()[0].id)!;
  s.sortReview(review.id,'Real Estate','2,501–3,500 sq ft');
  assert.equal(s.reviews().find(item=>item.id===review.id)?.status,'reviewed');
  assert.equal(s.sorts()[0].category,'Real Estate');assert.equal(s.invoices().length,1);assert.equal(s.invoices()[0].squareFeet,'2,501–3,500 sq ft');
  s.apply('google-calendar',[raw('PP Client With Missing Property',{location:''})]);
  assert.equal(s.sorts()[0].squareFootageRange,'2,501–3,500 sq ft');
 }finally{s.close();}
});
test('deleted shoots and linked drafts stay hidden through reimport, then restore',()=>{
 const s=new Store(':memory:');try{
  s.setSetting('active-calendar','google-calendar');s.apply('google-calendar',[raw('PP Test Client')]);const job=s.jobs()[0];s.createInvoice(job.id);assert.equal(currentJobs(s).length,1);
  s.deleteJob(job.id);assert.equal(currentJobs(s).length,0);assert.equal(s.deletedItems().length,1);
  s.apply('google-calendar',[raw('PP Test Client')]);assert.equal(currentJobs(s).length,0);assert.equal(s.invoices().length,1);
  s.restoreReview(s.deletedItems()[0].reviewId);assert.equal(currentJobs(s).length,1);assert.equal(s.deletedItems().length,0);
 }finally{s.close();}
});
test('approved rate suggestions require a single exact category, range, service and currency match',()=>{
 const s=new Store(':memory:');try{
  s.apply('test',[raw()]);const invoice=s.createInvoice(s.jobs()[0].id);
  const rate=normalizeRate({profile:'standard',category:'Real Estate',service:'Premium photo',squareFootageRange:'2,501–3,500 sq ft',currency:'CAD',unitPriceCents:75000});s.saveRate(rate);
  const confirmed={...invoice,pricingProfile:'standard' as const};
  assert.equal(rateSuggestions(confirmed,{jobId:invoice.jobId,category:'Real Estate',squareFootageRange:'2,501–3,500 sq ft',updatedAt:'now'},s.rates())[0]?.amountCents,75000);
  assert.equal(rateSuggestions(invoice,{jobId:invoice.jobId,category:'Commercial',squareFootageRange:'',updatedAt:'now'},s.rates()).length,0);
 }finally{s.close();}
});
test('current CAD rate sheets seed once, and custom tiers never supply a fixed price',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jfm-rates-')),path=join(dir,'hub.sqlite');
 try{
  const s=new Store(path);assert.equal(s.rates().filter(rate=>rate.profile==='standard').length,54);assert.equal(s.rates().filter(rate=>rate.profile==='legacy').length,44);
  const premium=s.rates().find(rate=>rate.profile==='standard'&&rate.service==='Premium photo'&&rate.squareFootageRange==='6,001–7,500 sq ft')!;assert.equal(premium.unitPriceCents,85000);assert.equal(premium.maxSqft,7500);
  const legacy=s.rates().find(rate=>rate.profile==='legacy'&&rate.service==='Premium photo'&&rate.squareFootageRange==='6,001–7,500 sq ft')!;assert.equal(legacy.unitPriceCents,65000);assert.equal(legacy.maxSqft,7500);
  s.apply('test',[raw()]);const invoice={...s.createInvoice(s.jobs()[0].id),pricingProfile:'standard' as const};
  const sort={jobId:invoice.jobId,category:'Real Estate' as const,squareFootageRange:'7,001–7,500 sq ft',updatedAt:'now'};
  assert.equal(rateSuggestions(invoice,sort,s.rates())[0]?.amountCents,85000);
  assert.equal(rateSuggestions({...invoice,pricingProfile:'legacy'},sort,s.rates())[0]?.amountCents,65000);
  const custom={...sort,squareFootageRange:'Over 7,500 sq ft'};
  assert.equal(rateSuggestions(invoice,custom,s.rates()).length,0);
  assert.equal(customPricePrompts(invoice,custom,s.guidance())[0]?.upperCents,125000);
  s.close();const reopened=new Store(path);assert.equal(reopened.rates().length,98);reopened.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('email suggestions show only explicit currency amounts',()=>{
 const payload={id:'message',threadId:'thread',snippet:'Quoted $600 or CAD $750 for this project',payload:{mimeType:'text/plain',body:{data:Buffer.from('Quoted $600 or CAD $750 for this project').toString('base64url')},headers:[{name:'Subject',value:'Project quote'}]}};
 const matches=extractEmailPrices(payload);assert.equal(matches.length,1);assert.equal(matches[0].amountCents,75000);assert.equal(matches[0].currency,'CAD');
});
test('reference import is idempotent and unique Legacy clients default to their sheet',()=>{
 const s=new Store(':memory:');try{
  const bundle={customers_master:[{customer_id:'C1',display_name:'Exact Client',legacy_status:'YES - on list (exact email)',billing_route:'PDF / e-transfer',pdf_invoices_2026:'2',pdf_client_names:'Exact Client'}],invoices_2026_extracted:[{file:'sample.pdf',jfm_no_printed:'26001',date_issued:'2026-05-01',due_date:'2026-06-01',balance_due_printed:'450',services:'Premium photo',billto_name:'Exact Client',billto_company:'',client_in_filename:'',totals_reconcile:'True'}],pricing_2026Q2:[{table:'stripe_observed',section:'Fees',item:'Rush',condition:'',price_cad:'125',source:'Stripe export',notes:'Conflicts with sheet',confirm:'yes'}],audit_backtest_2026:[],legacy_list_match:[],acronyms_v0:[]};
  s.importReferenceBundle(bundle,'a'.repeat(64));s.importReferenceBundle(bundle,'a'.repeat(64));
  assert.throws(()=>s.importReferenceBundle({...bundle,customers_master:[]},'b'.repeat(64)),/different reference archive/);
  assert.equal(s.referenceRows('customers_master').length,1);assert.equal(s.referenceImports().length,6);
  const match=referenceForClient(s,'EXACT  CLIENT');assert.equal(match.customer?.profileHint,'legacy');assert.equal(match.historicalInvoices.length,1);
  assert.equal(referenceForClient(s,'Another Client').customer,null);assert.equal(pricingQuestions(s).length,1);
  s.apply('test',[raw('PP Exact Client')]);const invoice=s.createInvoice(s.jobs()[0].id);assert.equal(invoice.pricingProfile,'legacy');assert.equal(invoice.pricingProfileMode,'automatic');
  assert.equal(rateSuggestions(invoice,{jobId:invoice.jobId,category:'Real Estate',squareFootageRange:'2,501–3,500 sq ft',updatedAt:'now'},s.rates())[0]?.profile,'legacy');
 }finally{s.close();}
});
test('automatic client pricing, invoice overrides and individual line overrides stay distinct',()=>{
 const s=new Store(':memory:');try{
  const empty={customers_master:[{customer_id:'C1',display_name:'Legacy Client',legacy_status:'YES - on list (exact email)'},{customer_id:'C2',display_name:'Standard Client',legacy_status:'NO'},{customer_id:'C3',display_name:'Ambiguous Client',legacy_status:'NO'},{customer_id:'C4',display_name:'Ambiguous Client',legacy_status:'YES - on list'}],invoices_2026_extracted:[],pricing_2026Q2:[],audit_backtest_2026:[],legacy_list_match:[],acronyms_v0:[]};
  s.importReferenceBundle(empty,'c'.repeat(64));
  assert.equal(referenceForClient(s,'Legacy Client','','Real Estate').automatic.profile,'legacy');
  assert.equal(referenceForClient(s,'Standard Client','','Real Estate').automatic.profile,'standard');
  assert.equal(referenceForClient(s,'New Client','','Real Estate').automatic.profile,'standard');
  assert.equal(referenceForClient(s,'Ambiguous Client','','Real Estate').automatic.profile,'review');
  assert.equal(referenceForClient(s,'New Client','2026-03-10','Real Estate').automatic.profile,'legacy');
  assert.throws(()=>s.setClientPricingOverride('Ambiguous Client','legacy'),/ambiguous/);
  s.setClientPricingOverride('New Client','legacy');assert.equal(referenceForClient(s,'New Client','','Real Estate').automatic.profile,'legacy');
  s.setClientPricingOverride('New Client',null);assert.equal(referenceForClient(s,'New Client','','Real Estate').automatic.profile,'standard');
  s.apply('test',[raw('PP Legacy Client')]);const invoice=s.createInvoice(s.jobs()[0].id);assert.equal(invoice.pricingProfile,'legacy');
  const sort={jobId:invoice.jobId,category:'Real Estate' as const,squareFootageRange:'2,501–3,500 sq ft',updatedAt:'now'};
  const legacy=rateSuggestions(invoice,sort,s.rates())[0];assert.equal(legacy?.profile,'legacy');
  const lineOverride={...invoice,lines:invoice.lines.map(line=>({...line,pricingProfileOverride:'standard' as const}))};assert.equal(rateSuggestions(lineOverride,sort,s.rates())[0]?.profile,'standard');
  const invoiceOverride={...invoice,pricingProfileMode:'invoice' as const,pricingProfile:'standard' as const};assert.equal(s.effectiveInvoicePricing(invoiceOverride).pricingProfile,'standard');
  assert.equal(s.effectiveInvoicePricing({...invoice,client:'Standard Client'}).pricingProfile,'standard');
 }finally{s.close();}
});
test('tokens are authenticated encryption and production fails closed',()=>{
 const key=Buffer.alloc(32,7).toString('base64');const a=seal('private-token',key);assert.equal(unseal(a,key),'private-token');assert.notEqual(a,seal('private-token',key));const b=Buffer.from(a,'base64');b[b.length-1]^=1;assert.throws(()=>unseal(b.toString('base64'),key));
 assert.equal(validEncryptionKey(key),true);assert.equal(validEncryptionKey('!'.repeat(44)),false);
 const s=new Store(':memory:');try{assert.equal(signedIn({headers:{}} as any,s),false);assert.throws(()=>validateConfig());}finally{s.close();}
});
test('configuration rejects unsafe modes, origins, ports and backup aliasing',()=>{
 const old={mode:config.mode,origin:config.origin,port:config.port,encryptionKey:config.encryptionKey,backupDir:config.backupDir,secondaryBackupDir:config.secondaryBackupDir};
 try{
  config.mode='local';config.origin='http://127.0.0.1:4310';config.port=4310;config.secondaryBackupDir='';assert.doesNotThrow(validateConfig);
  config.mode='preview';assert.throws(validateConfig,/APP_MODE/);config.mode='local';
  config.origin='http://127.0.0.1:4310/path';assert.throws(validateConfig,/only the scheme and host/);config.origin='http://127.0.0.1:4310';
  config.port=70000;assert.throws(validateConfig,/PORT/);config.port=4310;
  config.secondaryBackupDir=config.backupDir;assert.throws(validateConfig,/independent/);
 }finally{Object.assign(config,old);}
});
test('deadline assumptions stay provisional and honor an explicitly supplied holiday',()=>{
 assert.equal(deadline('2026-09-24T10:00:00-07:00',['Premium photo']).due,'2026-09-28');
 assert.equal(deadline('2026-09-24T10:00:00-07:00',['Premium photo'],['2026-09-28']).due,'2026-09-29');
 assert.ok(deadline('2026-09-21T10:00:00-07:00',['Basic photo']).deadlineBasis.includes('need approval'));
});
test('a new booking change reopens a previously reviewed change',()=>{
 const s=new Store(':memory:');try{s.apply('test',[raw()]);s.apply('test',[raw('PP Changed Client')]);const r=s.reviews().find(x=>x.kind==='Booking changed')!;s.resolve(r.id,'reviewed','Confirmed');s.apply('test',[raw('EP Changed Client')]);assert.equal(s.reviews().find(x=>x.id===r.id)?.status,'open');}finally{s.close();}
});
test('invoice drafts require explicit completion, prices, tax treatment and clear reviews',()=>{
 const job=parseBooking(raw(), 'test')!;
 const base=normalizeInvoiceInput({status:'ready',client:'Test Client',property:'Test property',squareFeet:'2,000 approximate',pricingProfile:'standard',currency:'CAD',invoiceDate:'2026-09-25',dueDate:'2026-10-25',completionConfirmed:true,taxTreatment:'taxable',taxRateBps:500,taxNote:'BC GST confirmed',lines:[{id:'photos',description:'Premium photo',quantity:1,unitPriceCents:75000}],notes:''});
 assert.deepEqual(validateInvoiceDraft(base,job,[],DateTime.fromISO('2026-09-25T12:00:00-07:00')),[]);
 assert.deepEqual(invoiceTotals(base),{subtotalCents:75000,taxCents:3750,totalCents:78750});
 assert.ok(validateInvoiceDraft({...base,taxTreatment:'review',taxRateBps:0},job,[],DateTime.fromISO('2026-09-25T12:00:00-07:00')).some(error=>error.includes('tax treatment')));
 assert.ok(validateInvoiceDraft(base,job,[{id:'review',kind:'Check booking',title:'Test',detail:'Check',jobId:job.id,source:'test',status:'open',updatedAt:'now'}],DateTime.fromISO('2026-09-25T12:00:00-07:00')).some(error=>error.includes('open review')));
 const q1=parseBooking(raw('PP Test Client',{start:'2026-03-25T10:00:00-07:00',end:'2026-03-25T11:00:00-07:00'}),'test')!;
 assert.deepEqual(validateInvoiceDraft(base,q1,[],DateTime.fromISO('2026-09-25T12:00:00-07:00')),[]);
});
test('invoice draft saves preserve history and reject stale updates',()=>{
 const s=new Store(':memory:');try{
  s.apply('test',[raw()]);const invoice=s.createInvoice(s.jobs()[0].id);assert.equal(invoice.status,'draft');assert.equal(invoice.lines[0].unitPriceCents,0);
  const saved=s.saveInvoice({...invoice,notes:'First private note'},invoice.updatedAt);assert.equal(s.invoices()[0].notes,'First private note');assert.equal(s.db.prepare('SELECT COUNT(*) n FROM invoice_history').get()?.n,1);
  assert.throws(()=>s.saveInvoice({...invoice,notes:'Stale edit'},invoice.updatedAt),/another session/);
 }finally{s.close();}
});
test('calendar failure preserves success time and does not prevent a backup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jfm-scheduler-'));const original=config.backupDir;config.backupDir=dir;const s=new Store(':memory:');
 try{s.setSetting('calendar-refresh','invalid-encrypted-token');s.setSync({id:'google-calendar',label:'Test',mode:'live',lastAttempt:null,lastSuccess:'2026-09-18T12:00:00Z',snapshotAt:null,error:null,count:3,syncToken:'old'});await scheduledTick(s);assert.equal(s.sync('google-calendar')?.lastSuccess,'2026-09-18T12:00:00Z');assert.equal(s.sync('google-calendar')?.syncToken,'old');assert.ok(s.sync('google-calendar')?.error);assert.ok(s.sync('backup')?.lastSuccess);}finally{s.close();config.backupDir=original;rmSync(dir,{recursive:true,force:true});}
});
test('backup creates daily and monthly copies in both configured locations',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jfm-backup-')),primary=join(dir,'primary'),secondary=join(dir,'secondary');
 const oldPrimary=config.backupDir,oldSecondary=config.secondaryBackupDir;config.backupDir=primary;config.secondaryBackupDir=secondary;const s=new Store(join(dir,'live.sqlite'));
 try{mkdirSync(primary);writeFileSync(join(primary,'hub-2026-09-29.sqlite-wal'),'');writeFileSync(join(primary,'hub-2026-09-29.sqlite-shm'),'legacy');await dailyBackup(s,new Date('2026-10-01T02:00:00Z'));await dailyBackup(s,new Date('2026-10-01T03:00:00Z'));assert.deepEqual(readdirSync(primary).sort(),['hub-2026-09-30.sqlite','hub-monthly-2026-09.sqlite']);assert.deepEqual(readdirSync(secondary).sort(),['hub-2026-09-30.sqlite','hub-monthly-2026-09.sqlite']);assert.equal(s.sync('backup')?.lastSuccess,'2026-10-01T03:00:00.000Z');}
 finally{s.close();config.backupDir=oldPrimary;config.secondaryBackupDir=oldSecondary;rmSync(dir,{recursive:true,force:true});}
});
test('cancelled recurrence exception without a start becomes a reviewable tombstone',()=>{
 const events=readICS('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:cancel-series\r\nRECURRENCE-ID:20260922T170000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR');assert.equal(events.length,1);assert.equal(events[0].status,'cancelled');assert.equal(events[0].start,'2026-09-22T17:00:00.000Z');
});
