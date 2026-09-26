import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import type {DeletedItem,InvoiceDraft,Job,PricingProfile,Rate,RateGuidance,RawEvent,Review,ShootCategory,ShootSort,SyncState} from './types.ts';
import {parseBooking,stableId} from './parser.ts';
import {newInvoiceInput} from './invoicing.ts';
import {approvedGuidance,approvedRates,legacyRates} from './approved-rates.ts';
import {squareFootageBands} from './types.ts';
import {automaticPricing,clientOverrideKey} from './reference.ts';
export class Store {
 db:DatabaseSync;
 constructor(public path:string){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,source TEXT NOT NULL,source_id TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(source,source_id));
   CREATE TABLE IF NOT EXISTS ignored(id TEXT PRIMARY KEY,source TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sync(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,expires INTEGER NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS invoice_drafts(id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS invoice_history(id INTEGER PRIMARY KEY,invoice_id TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS shoot_sort(job_id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS deleted_items(review_id TEXT PRIMARY KEY,job_id TEXT,deleted_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS rates(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS rate_guidance(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS reference_records(dataset TEXT NOT NULL,row_number INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(dataset,row_number));
   CREATE TABLE IF NOT EXISTS reference_imports(dataset TEXT PRIMARY KEY,source_hash TEXT NOT NULL,imported_at TEXT NOT NULL,row_count INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS client_pricing_overrides(client_key TEXT PRIMARY KEY,profile TEXT NOT NULL CHECK(profile IN ('standard','legacy')),updated_at TEXT NOT NULL);
  `);
  for(const rate of this.rates())if(rate.minSqft===undefined||!rate.profile){const band=squareFootageBands.find(item=>item.label===rate.squareFootageRange);const migrated={...rate,profile:rate.profile||'standard',minSqft:rate.minSqft??band?.min??null,maxSqft:rate.maxSqft??band?.max??null,unit:rate.unit||'job',source:rate.source||'Earlier manual entry',note:rate.note||''};this.db.prepare('UPDATE rates SET payload=? WHERE id=?').run(JSON.stringify(migrated),rate.id);}
  const commercialVideoNames=new Map([['Short Visit (<2 hrs)','Commercial video short visit (<2 hrs)'],['Half-Day Rate (<4 hrs)','Commercial video half-day (<4 hrs)'],['Full-Day Rate (<8 hrs)','Commercial video full-day (<8 hrs)'],['15–30 sec Deliverable','Commercial video deliverable (15–30 sec)'],['30–60 sec Deliverable','Commercial video deliverable (30–60 sec)'],['60–120 sec Deliverable','Commercial video deliverable (60–120 sec)']]);
  for(const rate of this.rates())if(rate.source.startsWith('2026 Q2')&&commercialVideoNames.has(rate.service))this.db.prepare('UPDATE rates SET payload=? WHERE id=?').run(JSON.stringify({...rate,service:commercialVideoNames.get(rate.service)}),rate.id);
  for(const row of this.db.prepare('SELECT id,payload FROM invoice_drafts').all() as {id:string;payload:string}[]){const invoice=JSON.parse(row.payload) as InvoiceDraft;if(!invoice.pricingProfileMode||!invoice.pricingProfile){const migrated={...invoice,pricingProfile:invoice.pricingProfile||'review',pricingProfileMode:invoice.pricingProfileMode||((invoice.pricingProfile&&invoice.pricingProfile!=='review')?'invoice':'automatic')};this.db.prepare('UPDATE invoice_drafts SET payload=? WHERE id=?').run(JSON.stringify(migrated),row.id);}}
  const key=(rate:Rate)=>`${rate.profile}\0${rate.category}\0${rate.service.toLowerCase()}\0${rate.squareFootageRange}\0${rate.currency}`;
  const known=new Set(this.rates().map(key));
  for(const rate of [...approvedRates('CAD'),...legacyRates()])if(!known.has(key(rate))){this.db.prepare('INSERT OR IGNORE INTO rates VALUES(?,?)').run(rate.id,JSON.stringify(rate));known.add(key(rate));}
  for(const item of this.guidance())if(!item.profile)this.db.prepare('UPDATE rate_guidance SET payload=? WHERE id=?').run(JSON.stringify({...item,profile:'standard'}),item.id);
  for(const item of approvedGuidance)this.db.prepare('INSERT OR IGNORE INTO rate_guidance VALUES(?,?)').run(item.id,JSON.stringify(item));
 }
 getSetting(key:string){return (this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined)?.value;}
 setSetting(key:string,value:string){this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key,value);}
 jobs():Job[]{return (this.db.prepare('SELECT payload FROM jobs').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 reviews():Review[]{return (this.db.prepare('SELECT payload FROM reviews').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 sorts():ShootSort[]{return (this.db.prepare('SELECT payload FROM shoot_sort').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 rates():Rate[]{return (this.db.prepare('SELECT payload FROM rates ORDER BY rowid DESC').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 guidance():RateGuidance[]{return (this.db.prepare('SELECT payload FROM rate_guidance').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 referenceRows(dataset:string):Record<string,string>[]{return (this.db.prepare('SELECT payload FROM reference_records WHERE dataset=? ORDER BY row_number').all(dataset) as {payload:string}[]).map(row=>JSON.parse(row.payload));}
 referenceImports(){return this.db.prepare('SELECT dataset,source_hash,imported_at,row_count FROM reference_imports ORDER BY dataset').all() as {dataset:string;source_hash:string;imported_at:string;row_count:number}[];}
 getClientPricingOverride(key:string):PricingProfile|null{return (this.db.prepare('SELECT profile FROM client_pricing_overrides WHERE client_key=?').get(key) as {profile:PricingProfile}|undefined)?.profile||null;}
 setClientPricingOverride(client:string,profile:PricingProfile|null){const key=clientOverrideKey(this,client);if(!key)throw new Error('This customer name is missing or ambiguous. Confirm the billing identity before saving a client-wide override.');if(profile!==null&&profile!=='standard'&&profile!=='legacy')throw new Error('Choose Standard or Legacy pricing.');if(profile)this.db.prepare('INSERT OR REPLACE INTO client_pricing_overrides VALUES(?,?,?)').run(key,profile,new Date().toISOString());else this.db.prepare('DELETE FROM client_pricing_overrides WHERE client_key=?').run(key);this.audit(profile?'client-pricing-override-saved':'client-pricing-override-cleared',key);}
 effectiveInvoicePricing(invoice:InvoiceDraft,force=false):InvoiceDraft{if(invoice.pricingProfileMode!=='automatic'||invoice.status==='ready'&&!force)return invoice;const job=this.jobs().find(item=>item.id===invoice.jobId),sort=this.sorts().find(item=>item.jobId===invoice.jobId);return {...invoice,pricingProfile:automaticPricing(this,invoice.client,job?.start.slice(0,10)||'',sort?.category).profile};}
 importReferenceBundle(bundle:Record<string,Record<string,string>[]>,sourceHash:string,replace=false){
  const allowed=['customers_master','invoices_2026_extracted','pricing_2026Q2','audit_backtest_2026','legacy_list_match','acronyms_v0'];
  if(allowed.some(name=>!Array.isArray(bundle[name]))||Object.keys(bundle).some(name=>!allowed.includes(name))||!/^([a-f0-9]{64})$/.test(sourceHash))throw new Error('Invalid reference bundle');
  if(!replace&&this.referenceImports().some(item=>item.source_hash!==sourceHash))throw new Error('A different reference archive is already imported. Back up the database and pass --replace to replace it.');
  const at=new Date().toISOString();this.db.exec('BEGIN IMMEDIATE');try{
   for(const dataset of allowed){this.db.prepare('DELETE FROM reference_records WHERE dataset=?').run(dataset);const insert=this.db.prepare('INSERT INTO reference_records VALUES(?,?,?)');bundle[dataset].forEach((row,index)=>insert.run(dataset,index+1,JSON.stringify(row)));this.db.prepare('INSERT OR REPLACE INTO reference_imports VALUES(?,?,?,?)').run(dataset,sourceHash,at,bundle[dataset].length);}
   this.audit('reference-bundle-imported',sourceHash);this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 deletedItems():DeletedItem[]{return (this.db.prepare('SELECT review_id,job_id,deleted_at FROM deleted_items ORDER BY deleted_at DESC').all() as {review_id:string;job_id:string|null;deleted_at:string}[]).map(row=>({reviewId:row.review_id,jobId:row.job_id,title:this.reviews().find(review=>review.id===row.review_id)?.title||this.jobs().find(job=>job.id===row.job_id)?.client||'Deleted item',deletedAt:row.deleted_at}));}
 deletedJobIds(){return new Set(this.deletedItems().flatMap(item=>item.jobId?[item.jobId]:[]));}
 deletedReviewIds(){return new Set(this.deletedItems().map(item=>item.reviewId));}
 sortReview(id:string,category:ShootCategory,squareFootageRange:string,resolution=''){
  const review=this.reviews().find(item=>item.id===id);if(!review||review.status!=='open'||this.deletedReviewIds().has(id)||review.jobId&&this.deletedJobIds().has(review.jobId))throw new Error('Review item is not open');
  if(category==='Real Estate'&&!squareFootageRange)throw new Error('Choose a square-footage range');
  const at=new Date().toISOString();this.db.exec('BEGIN IMMEDIATE');try{
   if(review.jobId){const sort:ShootSort={jobId:review.jobId,category,squareFootageRange,updatedAt:at};this.db.prepare('INSERT OR REPLACE INTO shoot_sort VALUES(?,?)').run(review.jobId,JSON.stringify(sort));}
   this.db.prepare('UPDATE reviews SET payload=? WHERE id=?').run(JSON.stringify({...review,status:'reviewed',resolution,updatedAt:at}),id);
   if(review.jobId&&this.jobs().find(job=>job.id===review.jobId)?.status==='Booked'){
    const invoice=this.createInvoice(review.jobId);
    if(category==='Real Estate'&&invoice.status==='draft'&&!invoice.squareFeet){const next={...invoice,squareFeet:squareFootageRange,updatedAt:new Date(Math.max(Date.now(),Date.parse(invoice.updatedAt)+1)).toISOString()};this.db.prepare('UPDATE invoice_drafts SET payload=? WHERE id=?').run(JSON.stringify(next),invoice.id);this.audit('invoice-square-footage-sorted',invoice.id);}
   }
   this.audit('review-sorted',id);this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 deleteReview(id:string){const review=this.reviews().find(item=>item.id===id);if(!review)throw new Error('Review item not found');if(this.deletedReviewIds().has(id)||review.jobId&&this.deletedJobIds().has(review.jobId))throw new Error('Item is already in Recently Deleted');this.db.prepare('INSERT INTO deleted_items VALUES(?,?,?)').run(id,review.jobId,new Date().toISOString());this.audit('item-soft-deleted',id);}
 deleteJob(id:string){const job=this.jobs().find(item=>item.id===id);if(!job)throw new Error('Shoot not found');if(this.deletedJobIds().has(id))throw new Error('Shoot is already in Recently Deleted');const key=`job-${id}`;this.db.prepare('INSERT INTO deleted_items VALUES(?,?,?)').run(key,id,new Date().toISOString());this.audit('item-soft-deleted',key);}
 restoreReview(id:string){const item=this.deletedItems().find(entry=>entry.reviewId===id);if(!item)throw new Error('Deleted item not found');this.db.prepare('DELETE FROM deleted_items WHERE review_id=?').run(id);this.audit('item-restored',id);}
 saveRate(rate:Rate){const old=this.rates().find(item=>item.profile===rate.profile&&item.category===rate.category&&item.service.toLowerCase()===rate.service.toLowerCase()&&item.squareFootageRange===rate.squareFootageRange&&item.currency===rate.currency);const overridden=old&&old.source.startsWith('2026 Q2')&&old.unitPriceCents!==rate.unitPriceCents;const next={...rate,id:old?.id||rate.id,source:overridden?'Manual override':rate.source,note:overridden?`Overrides ${old.source}. ${old.note}`.trim():rate.note};this.db.prepare('INSERT OR REPLACE INTO rates VALUES(?,?)').run(next.id,JSON.stringify(next));this.audit('rate-saved',next.id);return next;}
 syncs():SyncState[]{return (this.db.prepare('SELECT payload FROM sync').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 invoices():InvoiceDraft[]{return (this.db.prepare('SELECT payload FROM invoice_drafts ORDER BY rowid DESC').all() as {payload:string}[]).map(r=>this.effectiveInvoicePricing(JSON.parse(r.payload)));}
 invoice(id:string){return this.invoices().find(invoice=>invoice.id===id);}
 createInvoice(jobId:string){
  const existing=this.invoices().find(invoice=>invoice.jobId===jobId);if(existing)return existing;
  const job=this.jobs().find(item=>item.id===jobId);if(!job)throw new Error('Job not found');
  if(job.status!=='Booked')throw new Error('Only booked jobs can have an invoice draft');
  const now=new Date().toISOString(),sort=this.sorts().find(item=>item.jobId===jobId),invoice:InvoiceDraft={id:stableId('invoice',jobId),jobId,...newInvoiceInput(job),createdAt:now,updatedAt:now};
  if(sort?.category==='Real Estate')invoice.squareFeet=sort.squareFootageRange;
  invoice.pricingProfile=this.effectiveInvoicePricing(invoice).pricingProfile;
  this.db.prepare('INSERT INTO invoice_drafts(id,job_id,payload) VALUES(?,?,?)').run(invoice.id,jobId,JSON.stringify(invoice));this.audit('invoice-draft-created',invoice.id);return invoice;
 }
 saveInvoice(invoice:InvoiceDraft,expectedUpdatedAt:string){
  const old=this.invoice(invoice.id);if(!old)throw new Error('Invoice draft not found');if(old.updatedAt!==expectedUpdatedAt)throw new Error('Invoice draft changed in another session');
  const now=Date.now(),updatedAt=new Date(Math.max(now,Date.parse(old.updatedAt)+1)).toISOString();
  const next=this.effectiveInvoicePricing({...invoice,id:old.id,jobId:old.jobId,createdAt:old.createdAt,updatedAt},true);
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO invoice_history(invoice_id,at,payload) VALUES(?,?,?)').run(old.id,next.updatedAt,JSON.stringify(old));this.db.prepare('UPDATE invoice_drafts SET payload=? WHERE id=?').run(JSON.stringify(next),old.id);this.audit(next.status==='ready'?'invoice-draft-ready':'invoice-draft-updated',old.id);this.db.exec('COMMIT');return next;}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 sync(id:string){return this.syncs().find(s=>s.id===id);}
 setSync(state:SyncState){this.db.prepare('INSERT OR REPLACE INTO sync VALUES(?,?)').run(state.id,JSON.stringify(state));}
 audit(action:string,id:string){this.db.prepare('INSERT INTO audit(at,action,entity_id) VALUES(?,?,?)').run(new Date().toISOString(),action,id);}
 review(r:Review,force=false){const old=this.reviews().find(x=>x.id===r.id);if(!force&&old&&old.detail===r.detail&&old.title===r.title)return;this.db.prepare('INSERT OR REPLACE INTO reviews VALUES(?,?)').run(r.id,JSON.stringify(r));}
 resolve(id:string,status:'reviewed'|'dismissed',resolution:string){const old=this.reviews().find(r=>r.id===id);if(!old)throw new Error('Review not found');this.db.prepare('UPDATE reviews SET payload=? WHERE id=?').run(JSON.stringify({...old,status,resolution,updatedAt:new Date().toISOString()}),id);this.audit('review-'+status,id);}
 apply(source:string,events:RawEvent[],options:{full?:boolean;contractor?:string;state?:SyncState}={}){
  const previous=this.jobs().filter(j=>j.source===source),byId=new Map(previous.map(j=>[j.sourceId,j]));let changed=0;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   for(const raw of events){
    const old=byId.get(raw.id);const job=parseBooking(raw,source,old,options.contractor);const id=stableId(source,raw.id);
    if(!job){
     this.db.prepare('INSERT OR IGNORE INTO ignored VALUES(?,?)').run(id,source);
     if(old){const update={...old,status:'Needs review',issues:[...new Set([...old.issues,'Title no longer matches a booking; confirm removal'])]};this.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run(JSON.stringify(update),id);this.review({id:'changed-'+id,kind:'Booking changed',title:old.client,detail:'The source no longer matches a booking. Historical details are preserved for review.',jobId:id,source,status:'open',updatedAt:new Date().toISOString()});}
     continue;
    }
    const same=old&&JSON.stringify({...old,updatedAt:''})===JSON.stringify({...job,updatedAt:''});
    if(!same){changed++;if(old)this.db.prepare('INSERT INTO history(job_id,at,payload) VALUES(?,?,?)').run(old.id,new Date().toISOString(),JSON.stringify(old));
     this.db.prepare('INSERT OR REPLACE INTO jobs VALUES(?,?,?,?)').run(id,source,raw.id,JSON.stringify(job));
     this.audit(old?'booking-updated':'booking-imported',id);
     if(old)this.review({id:'changed-'+id,kind:'Booking changed',title:job.client,detail:'A date, title, service, property or status changed. Check the job before acting.',jobId:id,source,status:'open',updatedAt:new Date().toISOString()},true);
    }
    if(job.issues.length)this.review({id:'parse-'+id,kind:'Check booking',title:job.client||'Client needs review',detail:job.issues.join('. '),jobId:id,source,status:'open',updatedAt:new Date().toISOString()});
   }
   if(options.full){const ids=new Set(events.map(e=>e.id));for(const old of previous)if(!ids.has(old.sourceId)){
    this.review({id:'missing-'+old.id,kind:'Missing from source',title:old.client,detail:'Not in the latest full snapshot. Check deletion, date range or a moved booking; it has not been erased.',jobId:old.id,source,status:'open',updatedAt:new Date().toISOString()});
   }}
   if(options.state)this.setSync(options.state);
   this.db.exec('COMMIT');return {changed,count:this.jobs().filter(j=>j.source===source).length};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 async backup(path:string){
  mkdirSync(dirname(path),{recursive:true,mode:0o700});await backup(this.db,path);
  const check=new DatabaseSync(path);let valid:Record<string,string>;
  try{check.exec('PRAGMA journal_mode=DELETE');valid=check.prepare('PRAGMA integrity_check').get() as Record<string,string>;}finally{check.close();}
  chmodSync(path,0o600);if(Object.values(valid!)[0]!=='ok')throw new Error('Backup verification failed');return path;
 }
 close(){this.db.close();}
}
