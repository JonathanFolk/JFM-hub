import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';
import {syncCalendar} from '../server/sync.ts';
import type {Completion} from '../server/completion.ts';
const event=(id='a',title='HOLD PS Test Client')=>({id,title,start:'2026-09-25T17:00:00Z',end:'2026-09-25T18:00:00Z',location:'123 Test St, Vancouver'});
const tombstone=(id='a')=>({...event(id,''),start:'',end:'',status:'cancelled'});
const trusted={googleDeletionEvidence:true};
const rerunLegacyCleanup=(s:Store)=>{s.db.prepare('DELETE FROM settings WHERE key=?').run('legacy-calendar-cancellations-v1');s.cleanupLegacyCancellations();};

test('legacy cleanup trashes old cancelled Google jobs regardless of window, but preserves other states and restores',()=>{
 const s=new Store(':memory:');try{
  s.apply('google-calendar',[{...event('old','PS Ffirth'),start:'2026-09-19T22:30:00Z',end:'2026-09-20T00:00:00Z',status:'cancelled'},event('held'),event('active','PS Active'),event('tbr','TBR PS Client')]);
  s.apply('calendar-export',[{...event('export','PS Export'),status:'cancelled'}]);
  const job=s.jobs().find(j=>j.sourceId==='old')!;
  rerunLegacyCleanup(s);
  assert.deepEqual([...s.deletedJobIds()],[job.id]);assert.equal(s.jobs().length,5);
  const evidence=JSON.parse(s.getSetting('calendar-deletion-'+job.id)!);assert.match(evidence.basis,/not a fresh Google read/);
  const audit=s.db.prepare('SELECT * FROM audit').all();s.cleanupLegacyCancellations();assert.deepEqual(s.db.prepare('SELECT * FROM audit').all(),audit);
  s.restoreReview(s.deletedItems()[0].reviewId);rerunLegacyCleanup(s);assert.equal(s.deletedItems().length,0);
 }finally{s.close();}
});

test('legacy cleanup protects drafts, completed jobs and historical floor-plan invoice links',()=>{
 const s=new Store(':memory:');try{
  s.apply('google-calendar',[event('draft','PS Draft'),event('complete'),event('parent','PS Parent')]);
  const draftJob=s.jobs().find(j=>j.sourceId==='draft')!,completeJob=s.jobs().find(j=>j.sourceId==='complete')!,parent=s.jobs().find(j=>j.sourceId==='parent')!;
  s.createInvoice(draftJob.id);s.createInvoice(parent.id);
  const completion:Completion={jobId:completeJob.id,row:{row:7,number:'26001',client:completeJob.client,date:'2026-09-26',totalCents:36750,paid:true,notes:completeJob.location,orders:''},spreadsheetId:'test',gid:1,readAt:'2026-09-27',matchedAt:'2026-09-27',basis:'Test evidence'};
  s.db.prepare('INSERT INTO completed_jobs VALUES(?,?)').run(completeJob.id,JSON.stringify(completion));
  s.apply('google-calendar',[tombstone('draft'),tombstone('complete')]);
  s.apply('google-calendar-floor',[{...event('fp','FP for Jon'),status:'cancelled'}],{contractor:'3D Elevate'});
  const support=s.jobs().find(j=>j.sourceId==='fp')!;
  s.db.prepare('INSERT INTO history(job_id,at,payload) VALUES(?,?,?)').run(support.id,'2026-09-24',JSON.stringify({...support,supportingJobId:parent.id}));
  const invoices=s.invoices(),completions=s.completions();rerunLegacyCleanup(s);
  assert.equal(s.deletedItems().length,0);assert.deepEqual(s.invoices(),invoices);assert.deepEqual(s.completions(),completions);
  for(const job of [draftJob,completeJob,parent,support])assert.ok(s.reviews().some(r=>r.jobId===job.id&&r.kind==='Calendar cancellation'));
 }finally{s.close();}
});

test('legacy cleanup respects pre-existing manual restores and rolls back on failure',()=>{
 const s=new Store(':memory:');try{
  s.apply('google-calendar',[{...event('restore','PS Restore'),status:'cancelled'},{...event('cleanup','PS Cleanup'),status:'cancelled'}]);
  const restored=s.jobs().find(j=>j.sourceId==='restore')!;s.deleteJob(restored.id);s.restoreReview(s.deletedItems()[0].reviewId);
  s.db.exec("CREATE TRIGGER fail_legacy BEFORE INSERT ON settings WHEN NEW.key='legacy-calendar-cancellations-v1' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.throws(()=>rerunLegacyCleanup(s),/test failure/);assert.equal(s.deletedItems().length,0);
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM settings WHERE key LIKE 'calendar-deletion-%'").get()!.n,0);
  s.db.exec('DROP TRIGGER fail_legacy');s.cleanupLegacyCancellations();
  assert.equal(s.deletedItems().length,1);assert.ok(!s.deletedJobIds().has(restored.id));
 }finally{s.close();}
});

test('explicit Google deletion soft-deletes only the known occurrence and retains history',()=>{
 const s=new Store(':memory:');try{
  s.apply('google',[event('series_1'),event('series_2')]);const job=s.jobs()[0];
  s.apply('google',[tombstone(job.sourceId),tombstone('unknown')],trusted);
  assert.equal(s.jobs().length,2);assert.deepEqual([...s.deletedJobIds()],[job.id]);
  assert.equal(s.jobs().find(j=>j.id===job.id)?.status,'Cancelled');
  assert.equal(JSON.parse(s.getSetting('calendar-deletion-'+job.id)!).outcome,'recently-deleted');
  assert.ok(s.db.prepare('SELECT 1 FROM history WHERE job_id=?').get(job.id));
  assert.ok(s.db.prepare("SELECT 1 FROM audit WHERE action='calendar-deletion-auto-trashed' AND entity_id=?").get(job.id));
 }finally{s.close();}
});

test('restored jobs stay restored on repeated tombstones; a new confirmed/deleted cycle is processed',()=>{
 const s=new Store(':memory:');try{
  s.apply('google',[event()]);const id=s.jobs()[0].id;s.apply('google',[tombstone()],trusted);
  s.restoreReview(s.deletedItems()[0].reviewId);s.apply('google',[tombstone()],trusted);
  assert.equal(s.deletedItems().length,0);
  s.apply('google',[{...event(),status:'confirmed'}],trusted);assert.equal(s.getSetting('calendar-deletion-'+id),undefined);
  s.apply('google',[tombstone()],trusted);assert.ok(s.deletedJobIds().has(id));
 }finally{s.close();}
});

test('draft and ready invoices protect deleted bookings without financial changes or repeated review reopening',()=>{
 for(const status of ['draft','ready'] as const){const s=new Store(':memory:');try{
  s.apply('google',[event('a','PS Test Client')]);const job=s.jobs()[0],draft=s.createInvoice(job.id);
  s.db.prepare('UPDATE invoice_drafts SET payload=? WHERE id=?').run(JSON.stringify({...draft,status,notes:'Keep these terms'}),draft.id);
  const before=s.invoices();s.apply('google',[tombstone()],trusted);
  assert.equal(s.deletedItems().length,0);assert.deepEqual(s.invoices(),before);
  const review=s.reviews().find(r=>r.kind==='Calendar cancellation')!;assert.equal(review.jobId,job.id);assert.equal(review.status,'open');
  s.resolve(review.id,'reviewed','Checked');s.apply('google',[tombstone()],trusted);
  assert.equal(s.reviews().filter(r=>r.kind==='Calendar cancellation').length,1);assert.equal(s.reviews().find(r=>r.id===review.id)?.status,'reviewed');
 }finally{s.close();}}
});

test('completed records without drafts are protected and get a cancellation review',()=>{
 const s=new Store(':memory:');try{
  s.apply('google',[event()]);const job=s.jobs()[0];
  const completion:Completion={jobId:job.id,row:{row:7,number:'26001',client:job.client,date:'2026-09-26',totalCents:36750,paid:false,notes:job.location,orders:''},spreadsheetId:'test',gid:1,readAt:'2026-09-27',matchedAt:'2026-09-27',basis:'Test evidence'};
  s.db.prepare('INSERT INTO completed_jobs VALUES(?,?)').run(job.id,JSON.stringify(completion));
  s.apply('google',[tombstone()],trusted);
  assert.equal(s.deletedItems().length,0);assert.deepEqual(s.completions(),[completion]);assert.equal(s.invoices().length,0);
  assert.ok(s.reviews().some(r=>r.jobId===job.id&&r.kind==='Calendar cancellation'&&r.status==='open'));
 }finally{s.close();}
});

test('absence, title cancellation and untrusted imports never automatically trash jobs',()=>{
 const s=new Store(':memory:');try{
  s.apply('google',[event()]);s.apply('google',[],{...trusted,full:true,window:{from:'2026-09-01',to:'2027-03-01'}});
  assert.ok(s.reviews().some(r=>r.kind==='Missing from source'));assert.equal(s.deletedItems().length,0);
  s.apply('google',[event('a','CANCELLED PS Test Client')],trusted);assert.equal(s.deletedItems().length,0);
  s.apply('google',[tombstone()]);assert.equal(s.deletedItems().length,0);
  assert.equal(s.getSetting('calendar-deletion-'+s.jobs()[0].id),undefined);
 }finally{s.close();}
});

test('linked floor-plan deletion protects the parent invoice and retains both jobs for review',()=>{
 const s=new Store(':memory:');try{
  s.apply('primary',[{...event('a','PS Test Client'),description:'2400 sqft'}]);
  s.apply('floor',[event('fp','FP for Jon')],{contractor:'3D Elevate'});
  const parent=s.jobs().find(j=>j.source==='primary')!,support=s.jobs().find(j=>j.source==='floor')!;
  assert.equal(support.supportingJobId,parent.id);const before=s.invoices();
  s.apply('floor',[{...tombstone('fp'),title:'[deleted]'}],{...trusted,contractor:'3D Elevate'});
  assert.equal(s.deletedItems().length,0);assert.deepEqual(s.invoices(),before);
  assert.equal(s.jobs().find(j=>j.id===support.id)?.supportingJobId,undefined);
  assert.deepEqual(s.reviews().filter(r=>r.kind==='Calendar cancellation').map(r=>r.jobId).sort(),[parent.id,support.id].sort());
 }finally{s.close();}
});

test('failed batch rolls back cancellation, trash and evidence together',()=>{
 const s=new Store(':memory:');try{
  s.apply('google',[event()]);const before=s.jobs();
  s.db.exec("CREATE TRIGGER fail_cancellation BEFORE INSERT ON settings WHEN NEW.key LIKE 'calendar-deletion-%' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.throws(()=>s.apply('google',[tombstone()],trusted),/test failure/);
  assert.deepEqual(s.jobs(),before);assert.equal(s.deletedItems().length,0);assert.equal(s.getSetting('calendar-deletion-'+before[0].id),undefined);
 }finally{s.close();}
});

test('Google sync trusts explicit tombstones, but failed reads and missing events preserve jobs',async()=>{
 const s=new Store(':memory:');const source={key:'primary',calendarId:'test@example.com',label:'Test'};
 const window={from:'2026-09-01',to:'2027-03-01'};
 try{
  s.apply('google-calendar',[event()]);
  const deps={token:async()=> 'fake',collect:async()=>({events:[],full:true,syncToken:'next',window}),read:async()=>null};
  await syncCalendar(s,true,source,deps);assert.equal(s.deletedItems().length,0);
  await assert.rejects(syncCalendar(s,true,source,{...deps,read:async()=>{throw new Error('Access lost');}}),/Access lost/);
  assert.equal(s.deletedItems().length,0);
  await syncCalendar(s,true,source,{...deps,read:async()=>tombstone()});assert.equal(s.deletedItems().length,1);
 }finally{s.close();}
});
