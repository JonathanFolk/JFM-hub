import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import type {DeletedItem,InvoiceDraft,Job,PricingProfile,Rate,RateGuidance,RawEvent,ReconciliationSuggestion,Review,ShootCategory,ShootSort,SyncState,SortDetails} from './types.ts';
import {parseBooking,stableId} from './parser.ts';
import {newInvoiceInput} from './invoicing.ts';
import {approvedGuidance,approvedRates,legacyRates,commercialPhotoRates} from './approved-rates.ts';
import {squareFootageBands,imagePackages} from './types.ts';
import {automaticPricing,clientOverrideKey} from './reference.ts';
import {areaRange,extractArea,isUnconfirmed,explicitAddons,commercialLines,samePropertyDay,serviceQuantity} from './workflow.ts';
import {rateSuggestions} from './rates.ts';
import type {Completion} from './completion.ts';
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
   CREATE TABLE IF NOT EXISTS reconciliation_suggestions(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS completed_jobs(job_id TEXT PRIMARY KEY,payload TEXT NOT NULL);
  `);
  for(const rate of this.rates())if(rate.minSqft===undefined||!rate.profile){const band=squareFootageBands.find(item=>item.label===rate.squareFootageRange);const migrated={...rate,profile:rate.profile||'standard',minSqft:rate.minSqft??band?.min??null,maxSqft:rate.maxSqft??band?.max??null,unit:rate.unit||'job',source:rate.source||'Earlier manual entry',note:rate.note||''};this.db.prepare('UPDATE rates SET payload=? WHERE id=?').run(JSON.stringify(migrated),rate.id);}
  const commercialVideoNames=new Map([['Short Visit (<2 hrs)','Commercial video short visit (<2 hrs)'],['Half-Day Rate (<4 hrs)','Commercial video half-day (<4 hrs)'],['Full-Day Rate (<8 hrs)','Commercial video full-day (<8 hrs)'],['15–30 sec Deliverable','Commercial video deliverable (15–30 sec)'],['30–60 sec Deliverable','Commercial video deliverable (30–60 sec)'],['60–120 sec Deliverable','Commercial video deliverable (60–120 sec)']]);
  for(const rate of this.rates())if(rate.source.startsWith('2026 Q2')&&commercialVideoNames.has(rate.service))this.db.prepare('UPDATE rates SET payload=? WHERE id=?').run(JSON.stringify({...rate,service:commercialVideoNames.get(rate.service)}),rate.id);
  for(const row of this.db.prepare('SELECT id,payload FROM invoice_drafts').all() as {id:string;payload:string}[]){const invoice=JSON.parse(row.payload) as InvoiceDraft;if(!invoice.pricingProfileMode||!invoice.pricingProfile){const migrated={...invoice,pricingProfile:invoice.pricingProfile||'review',pricingProfileMode:invoice.pricingProfileMode||((invoice.pricingProfile&&invoice.pricingProfile!=='review')?'invoice':'automatic')};this.db.prepare('UPDATE invoice_drafts SET payload=? WHERE id=?').run(JSON.stringify(migrated),row.id);}}
  const key=(rate:Rate)=>`${rate.profile}\0${rate.category}\0${rate.service.toLowerCase()}\0${rate.squareFootageRange}\0${rate.currency}`;
  const known=new Set(this.rates().map(key));
  for(const rate of [...approvedRates('CAD'),...legacyRates(),...commercialPhotoRates()])if(!known.has(key(rate))){this.db.prepare('INSERT OR IGNORE INTO rates VALUES(?,?)').run(rate.id,JSON.stringify(rate));known.add(key(rate));}
  for(const item of this.guidance())if(!item.profile)this.db.prepare('UPDATE rate_guidance SET payload=? WHERE id=?').run(JSON.stringify({...item,profile:'standard'}),item.id);
  for(const item of approvedGuidance)this.db.prepare('INSERT OR IGNORE INTO rate_guidance VALUES(?,?)').run(item.id,JSON.stringify(item));
  if(!this.getSetting('gst-default-v1')){for(const invoice of this.invoices().filter(i=>i.status==='draft'&&i.taxTreatment==='review')){const next={...invoice,taxTreatment:'taxable',taxRateBps:500,taxNote:'5% GST — business default set by owner.',updatedAt:new Date().toISOString()};this.db.prepare('INSERT INTO invoice_history(invoice_id,at,payload) VALUES(?,?,?)').run(invoice.id,next.updatedAt,JSON.stringify(invoice));this.db.prepare('UPDATE invoice_drafts SET payload=? WHERE id=?').run(JSON.stringify(next),invoice.id);}this.setSetting('gst-default-v1','1');}
  if(!this.getSetting('workflow-v3')){this.db.exec('BEGIN IMMEDIATE');try{
   for(const old of this.jobs()){const area=extractArea(`${old.title}\n${old.description||''}`),unconfirmed=old.status!=='Cancelled'&&(['Held','To reschedule'].includes(old.status)||isUnconfirmed(old.title));const next={...old,area:area.area,areaIssue:area.areaIssue,...(unconfirmed?{status:'Unconfirmed' as const,due:null}:{}),services:[...new Set([...old.services,...explicitAddons(old.description||'')])]};this.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run(JSON.stringify(next),old.id);if(area.areaIssue)this.review({id:'area-review-'+old.id,kind:'Confirm square footage',jobId:old.id,title:old.client,source:old.source,detail:area.areaIssue,status:'open',updatedAt:new Date().toISOString()});}
   for(const old of this.sorts()){if(old.category==='Design'){this.db.prepare('UPDATE shoot_sort SET payload=? WHERE job_id=?').run(JSON.stringify({...old,category:'Commercial'}),old.jobId);const job=this.jobs().find(j=>j.id===old.jobId);if(job)this.review({id:'commercial-type-'+job.id,kind:'Commercial category',jobId:job.id,title:job.client,source:job.source,detail:'Choose a commercial subtype for this former Design booking. Existing draft prices are preserved.',status:'open',updatedAt:new Date().toISOString()});}}
   this.enrichBookings();this.setSetting('workflow-v3','1');this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}}
 }
 getSetting(key:string){return (this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined)?.value;}
 catalogueSnapshot(jobId:string){return {sort:this.db.prepare('SELECT * FROM shoot_sort WHERE job_id=?').get(jobId)||null,invoice:this.db.prepare('SELECT * FROM invoice_drafts WHERE job_id=?').get(jobId)||null,reviews:(this.db.prepare('SELECT * FROM reviews ORDER BY id').all() as {id:string;payload:string}[]).filter(r=>JSON.parse(r.payload).jobId===jobId),seen:this.getSetting('auto-services-'+jobId)||null};}
 catalogue(jobId:string,category:ShootCategory,range:string,resolution:string,details:SortDetails){
  const job=this.jobs().find(j=>j.id===jobId);if(!job||this.deletedJobIds().has(jobId)||job.status==='Cancelled')throw new Error('Choose an active booking.');
  this.db.exec('BEGIN IMMEDIATE');try{const before=this.catalogueSnapshot(jobId),id='sort-'+jobId;
   this.review({id,jobId,title:job.client,source:job.source,kind:'Sort shoot',detail:'Manual classification.',status:'open',updatedAt:new Date().toISOString()},true);
   this.sortReview(id,category,range,resolution,details);
   for(const review of this.reviews().filter(r=>r.jobId===jobId&&r.status==='open'&&['Check booking','Sort shoot','Square footage'].includes(r.kind)))this.resolve(review.id,'reviewed',resolution||`Catalogued as ${category}.`);
   const token=stableId(jobId,String(Date.now())+String(Math.random()));this.setSetting('catalogue-undo-'+token,JSON.stringify({jobId,before,after:this.catalogueSnapshot(jobId),expires:Date.now()+600000}));this.db.exec('COMMIT');return {undoToken:token,invoice:this.invoices().find(i=>i.jobId===jobId)};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 undoCatalogue(token:string){
  const raw=this.getSetting('catalogue-undo-'+token);if(!raw)throw new Error('This selection was already undone or is unavailable.');const saved=JSON.parse(raw);
  this.db.exec('BEGIN IMMEDIATE');try{if(saved.expires<Date.now())throw new Error('Undo expired. Open the job to change its category.');if(this.deletedJobIds().has(saved.jobId)||JSON.stringify(this.catalogueSnapshot(saved.jobId))!==JSON.stringify(saved.after))throw new Error('This job changed after sorting. Undo would overwrite newer edits.');
   this.db.prepare('DELETE FROM shoot_sort WHERE job_id=?').run(saved.jobId);this.db.prepare('DELETE FROM invoice_drafts WHERE job_id=?').run(saved.jobId);
   for(const r of saved.after.reviews)this.db.prepare('DELETE FROM reviews WHERE id=?').run(r.id);
   if(saved.before.sort)this.db.prepare('INSERT INTO shoot_sort VALUES(?,?)').run(saved.jobId,saved.before.sort.payload);
   if(saved.before.invoice)this.db.prepare('INSERT INTO invoice_drafts VALUES(?,?,?)').run(saved.before.invoice.id,saved.jobId,saved.before.invoice.payload);
   for(const r of saved.before.reviews)this.db.prepare('INSERT INTO reviews VALUES(?,?)').run(r.id,r.payload);
   if(saved.before.seen)this.setSetting('auto-services-'+saved.jobId,saved.before.seen);else this.db.prepare('DELETE FROM settings WHERE key=?').run('auto-services-'+saved.jobId);
   this.db.prepare('DELETE FROM settings WHERE key=?').run('catalogue-undo-'+token);this.audit('catalogue-undone',saved.jobId);this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 setSetting(key:string,value:string){this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key,value);}
 jobs():Job[]{return (this.db.prepare('SELECT payload FROM jobs').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 reviews():Review[]{return (this.db.prepare('SELECT payload FROM reviews').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 sorts():ShootSort[]{return (this.db.prepare('SELECT payload FROM shoot_sort').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 completions():Completion[]{return (this.db.prepare('SELECT payload FROM completed_jobs').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 reopenJob(jobId:string){const entry=this.completions().find(c=>c.jobId===jobId);if(!entry)throw new Error('Completed job not found.');this.setSetting('previous-completion-'+jobId,JSON.stringify(entry));this.db.prepare('DELETE FROM completed_jobs WHERE job_id=?').run(jobId);this.audit('completed-job-reopened',jobId);}
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
 sortReview(id:string,category:ShootCategory,squareFootageRange:string,resolution='',details:SortDetails={}){
  const review=this.reviews().find(item=>item.id===id);if(!review||review.status!=='open'||this.deletedReviewIds().has(id)||review.jobId&&this.deletedJobIds().has(review.jobId))throw new Error('Review item is not open');
  if(category==='Real Estate'&&!squareFootageRange)throw new Error('Choose a square-footage range');
  const at=new Date().toISOString();this.db.exec('SAVEPOINT sort_review');try{
   if(review.jobId){const sort:ShootSort={jobId:review.jobId,category,squareFootageRange,...details,updatedAt:at};this.db.prepare('INSERT OR REPLACE INTO shoot_sort VALUES(?,?)').run(review.jobId,JSON.stringify(sort));}
   this.db.prepare('UPDATE reviews SET payload=? WHERE id=?').run(JSON.stringify({...review,status:'reviewed',resolution,updatedAt:at}),id);
   if(review.jobId&&this.jobs().find(job=>job.id===review.jobId)?.status!=='Cancelled'){
    const invoice=this.createInvoice(review.jobId,true);
    if(category==='Real Estate'&&invoice.status==='draft'&&!invoice.squareFeet){const next={...invoice,squareFeet:squareFootageRange,updatedAt:new Date(Math.max(Date.now(),Date.parse(invoice.updatedAt)+1)).toISOString()};this.db.prepare('UPDATE invoice_drafts SET payload=? WHERE id=?').run(JSON.stringify(next),invoice.id);this.audit('invoice-square-footage-sorted',invoice.id);}
   }
   if(review.jobId&&details.commercialSubtype==='Interior Design L')this.review({id:'design-terms-'+review.jobId,kind:'Confirm image allowance',jobId:review.jobId,title:review.title,source:review.source,detail:'Interior Design L has proposed 20/30-image allowances but the no-cap/overage policy is unresolved. Record the agreed delivery terms before invoicing.',status:'open',updatedAt:at});
   if(review.jobId&&details.commercialSubtype?.startsWith('Interior Design')&&details.commercialPackage==='short')this.review({id:'visit-terms-'+review.jobId,kind:'Confirm visit duration',jobId:review.jobId,title:review.title,source:review.source,detail:'The short-visit price is specified, but its duration is not. Record the agreed duration before invoicing.',status:'open',updatedAt:at});
   this.audit('review-sorted',id);this.db.exec('RELEASE sort_review');
  }catch(error){this.db.exec('ROLLBACK TO sort_review; RELEASE sort_review');throw error;}
 }
 deleteReview(id:string){const review=this.reviews().find(item=>item.id===id);if(!review)throw new Error('Review item not found');if(this.deletedReviewIds().has(id)||review.jobId&&this.deletedJobIds().has(review.jobId))throw new Error('Item is already in Recently Deleted');this.db.prepare('INSERT INTO deleted_items VALUES(?,?,?)').run(id,review.jobId,new Date().toISOString());this.audit('item-soft-deleted',id);}
 deleteJob(id:string){const job=this.jobs().find(item=>item.id===id);if(!job)throw new Error('Shoot not found');if(this.deletedJobIds().has(id))throw new Error('Shoot is already in Recently Deleted');const key=`job-${id}`;this.db.prepare('INSERT INTO deleted_items VALUES(?,?,?)').run(key,id,new Date().toISOString());this.audit('item-soft-deleted',key);}
 restoreReview(id:string){const item=this.deletedItems().find(entry=>entry.reviewId===id);if(!item)throw new Error('Deleted item not found');this.db.prepare('DELETE FROM deleted_items WHERE review_id=?').run(id);this.audit('item-restored',id);}
 saveRate(rate:Rate){const old=this.rates().find(item=>item.profile===rate.profile&&item.category===rate.category&&item.service.toLowerCase()===rate.service.toLowerCase()&&item.squareFootageRange===rate.squareFootageRange&&item.currency===rate.currency);const overridden=old&&old.source.startsWith('2026 Q2')&&old.unitPriceCents!==rate.unitPriceCents;const next={...rate,id:old?.id||rate.id,source:overridden?'Manual override':rate.source,note:overridden?`Overrides ${old.source}. ${old.note}`.trim():rate.note};this.db.prepare('INSERT OR REPLACE INTO rates VALUES(?,?)').run(next.id,JSON.stringify(next));this.audit('rate-saved',next.id);return next;}
 syncs():SyncState[]{return (this.db.prepare('SELECT payload FROM sync').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 reconciliationSuggestions():ReconciliationSuggestion[]{return (this.db.prepare('SELECT payload FROM reconciliation_suggestions ORDER BY rowid DESC').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 saveReconciliationSuggestion(suggestion:ReconciliationSuggestion){const old=this.db.prepare('SELECT payload FROM reconciliation_suggestions WHERE id=?').get(suggestion.id) as {payload:string}|undefined;if(old){const existing=JSON.parse(old.payload) as ReconciliationSuggestion;if(existing.status!=='open')return false;const next={...suggestion,createdAt:existing.createdAt,status:existing.status,resolution:existing.resolution};this.db.prepare('UPDATE reconciliation_suggestions SET payload=? WHERE id=?').run(JSON.stringify(next),suggestion.id);return false;}this.db.prepare('INSERT INTO reconciliation_suggestions VALUES(?,?)').run(suggestion.id,JSON.stringify(suggestion));this.audit('reconciliation-suggested',suggestion.id);return true;}
 resolveReconciliationSuggestion(id:string,status:'confirmed'|'dismissed',resolution:string){const old=this.reconciliationSuggestions().find(item=>item.id===id);if(!old)throw new Error('Suggestion not found.');if(old.status!=='open')throw new Error('Suggestion was already reviewed.');const next={...old,status,resolution,updatedAt:new Date().toISOString()};this.db.prepare('UPDATE reconciliation_suggestions SET payload=? WHERE id=?').run(JSON.stringify(next),id);this.audit('reconciliation-'+status,id);return next;}
 invoices():InvoiceDraft[]{return (this.db.prepare('SELECT payload FROM invoice_drafts ORDER BY rowid DESC').all() as {payload:string}[]).map(r=>this.effectiveInvoicePricing(JSON.parse(r.payload)));}
 invoice(id:string){return this.invoices().find(invoice=>invoice.id===id);}
 createInvoice(jobId:string,manual=false){
  const existing=this.invoices().find(invoice=>invoice.jobId===jobId);if(existing)return existing;
  const job=this.jobs().find(item=>item.id===jobId);if(!job)throw new Error('Job not found');
  if((job.status!=='Booked'&&!manual)||job.status==='Cancelled'||job.supportingJobId||this.deletedJobIds().has(jobId)||this.completions().some(c=>c.jobId===jobId))throw new Error('Only active booked jobs can have an invoice draft');
  const now=new Date().toISOString(),sort=this.sorts().find(item=>item.jobId===jobId),invoice:InvoiceDraft={id:stableId('invoice',jobId),jobId,...newInvoiceInput(job),createdAt:now,updatedAt:now};
  if(sort?.category==='Real Estate'){
   invoice.squareFeet=imagePackages.includes(sort.squareFootageRange)?sort.squareFootageRange:job.area?String(job.area):sort.squareFootageRange;
   if(imagePackages.includes(sort.squareFootageRange)){invoice.lines=invoice.lines.filter(l=>!['Premium photo','Basic photo'].includes(l.description));invoice.lines.unshift({id:'photo-package',description:`Editorial/Premium photography — up to ${sort.squareFootageRange===imagePackages[0]?5:10} images`,quantity:1,unitPriceCents:0});}
  }
  invoice.pricingProfile=this.effectiveInvoicePricing(invoice).pricingProfile;
  if(sort?.category==='Commercial'&&sort.commercialSubtype){invoice.lines=commercialLines(sort);invoice.squareFeet='Not applicable';invoice.pricingProfile='standard';invoice.pricingProfileMode='invoice';invoice.notes='Owner commercial schedule, September 2026. Confirm agreed scope before issuance.';}
  const suggestions=rateSuggestions(invoice,sort,this.rates());
  for(const line of invoice.lines){const found=suggestions.find(s=>s.lineId===line.id),rate=this.rates().find(r=>r.id===found?.rateId),quantity=serviceQuantity(line.description,job.description||'');if(found&&rate&&(rate.unit==='job'||sort?.category==='Commercial'||quantity)){line.unitPriceCents=found.amountCents;line.rateSource=rate.source;if(quantity)line.quantity=quantity;}}
  this.db.prepare('INSERT INTO invoice_drafts(id,job_id,payload) VALUES(?,?,?)').run(invoice.id,jobId,JSON.stringify(invoice));this.setSetting('auto-services-'+jobId,JSON.stringify(job.services));this.audit('invoice-draft-created',invoice.id);return invoice;
 }
 enrichBookings(){
  const deleted=this.deletedJobIds(),jobs=this.jobs(),at=new Date().toISOString();
  for(const support of jobs.filter(j=>j.floorPlanSource&&!deleted.has(j.id))){
   const candidates=jobs.filter(j=>!j.floorPlanSource&&!deleted.has(j.id)&&j.status==='Booked'&&samePropertyDay(j,support));
   const target=support.status==='Booked'&&candidates.length===1&&!this.invoices().some(i=>i.jobId===support.id)?candidates[0]:undefined;
   if(support.supportingJobId!==target?.id){const oldTarget=support.supportingJobId;support.supportingJobId=target?.id;this.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run(JSON.stringify(support),support.id);this.audit('floor-plan-link-updated',support.id);if(oldTarget&&oldTarget!==target?.id)this.review({id:'floor-link-'+support.id,kind:'Floor plan changed',jobId:oldTarget,title:support.client,source:support.source,detail:'Linked floor-plan evidence changed or was cancelled. Check existing draft lines; amounts were preserved.',status:'open',updatedAt:at});}
   if(!target)this.review({id:'floor-match-'+support.id,kind:'Match floor plan',jobId:support.id,title:support.client||'Floor plan for Jon',source:support.source,detail:candidates.length>1?'Several bookings share this address/date. Choose the matching booking.':'No unique confirmed booking at the same address and date. Check calendar notes and unit number.',status:'open',updatedAt:at});
  }
  for(const job of jobs){
   if(deleted.has(job.id)||job.supportingJobId||job.floorPlanSource||job.status!=='Booked'||this.completions().some(c=>c.jobId===job.id))continue;
   let sort=this.sorts().find(s=>s.jobId===job.id);
   if(!sort&&job.area&&!job.areaIssue&&!job.issues.length&&job.services.some(s=>['Premium photo','Basic photo'].includes(s))&&!/\b(?:commercial|design|developer)\b/i.test(job.title)){
    sort={jobId:job.id,category:'Real Estate',squareFootageRange:areaRange(job.area),updatedAt:at};this.db.prepare('INSERT INTO shoot_sort VALUES(?,?)').run(job.id,JSON.stringify(sort));this.audit('booking-auto-sorted',job.id);
    for(const review of this.reviews().filter(r=>r.jobId===job.id&&r.status==='open'&&['Square footage','Sort shoot'].includes(r.kind)))this.resolve(review.id,'reviewed',`Area from calendar: ${job.area} sq ft.`);
   }
   if(!sort||sort.category!=='Real Estate')continue;
   const draft=this.createInvoice(job.id);if(draft.status!=='draft')continue;
   const before=JSON.stringify(draft);const services=[...new Set([...job.services,...jobs.filter(s=>s.supportingJobId===job.id&&!deleted.has(s.id)).flatMap(s=>s.services)])];
   const seenKey='auto-services-'+job.id;const seen=new Set<string>(JSON.parse(this.getSetting(seenKey)||'[]'));
   for(const description of services){if(seen.has(description)||draft.lines.some(l=>l.description===description)||imagePackages.includes(sort.squareFootageRange)&&['Premium photo','Basic photo'].includes(description))continue;if(draft.lines.length>=25)break;
    const quantity=serviceQuantity(description,job.description||'');const line={id:stableId(draft.id,description),description,quantity:quantity||1,unitPriceCents:0,rateSource:''};const suggestion=rateSuggestions({...draft,lines:[line]},sort,this.rates())[0];const rate=this.rates().find(r=>r.id===suggestion?.rateId);if(suggestion&&rate&&(rate.unit==='job'||quantity)){line.unitPriceCents=suggestion.amountCents;line.rateSource=rate.source;}draft.lines.push(line);
   }
   services.forEach(s=>seen.add(s));this.setSetting(seenKey,JSON.stringify([...seen]));
   if(!draft.squareFeet&&job.area)draft.squareFeet=String(job.area);
   if(before!==JSON.stringify(draft)){this.db.prepare('INSERT INTO invoice_history(invoice_id,at,payload) VALUES(?,?,?)').run(draft.id,at,before);draft.updatedAt=new Date(Math.max(Date.now(),Date.parse(draft.updatedAt)+1)).toISOString();this.db.prepare('UPDATE invoice_drafts SET payload=? WHERE id=?').run(JSON.stringify(draft),draft.id);this.audit('invoice-evidence-enriched',draft.id);}
  }
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
 apply(source:string,events:RawEvent[],options:{full?:boolean;contractor?:string;state?:SyncState;window?:{from:string;to:string};googleDeletionEvidence?:boolean}={}){
  const previous=this.jobs().filter(j=>j.source===source),byId=new Map(previous.map(j=>[j.sourceId,j]));let changed=0;
  const deletions:{job:Job;linkedJobId?:string}[]=[];
  this.db.exec('BEGIN IMMEDIATE');
  try{
   for(const raw of events){
    if(options.window&&!byId.has(raw.id)&&!(Date.parse(raw.start)<Date.parse(options.window.to)&&Date.parse(raw.end)>Date.parse(options.window.from)))continue;
    const old=byId.get(raw.id);
    if(options.googleDeletionEvidence&&raw.status==='cancelled'&&!old)continue;
    const job=parseBooking(raw,source,old,options.contractor);const id=stableId(source,raw.id);
    if(!job){
     this.db.prepare('INSERT OR IGNORE INTO ignored VALUES(?,?)').run(id,source);
     if(old){const update={...old,status:'Needs review',issues:[...new Set([...old.issues,'Title no longer matches a booking; confirm removal'])]};this.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run(JSON.stringify(update),id);this.review({id:'changed-'+id,kind:'Booking changed',title:old.client,detail:'The source no longer matches a booking. Historical details are preserved for review.',jobId:id,source,status:'open',updatedAt:new Date().toISOString()});}
     continue;
    }
    if(old?.supportingJobId)job.supportingJobId=old.supportingJobId;
    if(options.googleDeletionEvidence){
     if(raw.status==='cancelled'&&old&&!this.getSetting('calendar-deletion-'+id))deletions.push({job,linkedJobId:old.supportingJobId});
     else if(raw.status==='confirmed'||raw.status==='tentative')this.db.prepare('DELETE FROM settings WHERE key=?').run('calendar-deletion-'+id);
    }
    const same=old&&JSON.stringify({...old,updatedAt:''})===JSON.stringify({...job,updatedAt:''});
    if(!same){changed++;if(old)this.db.prepare('INSERT INTO history(job_id,at,payload) VALUES(?,?,?)').run(old.id,new Date().toISOString(),JSON.stringify(old));
     this.db.prepare('INSERT OR REPLACE INTO jobs VALUES(?,?,?,?)').run(id,source,raw.id,JSON.stringify(job));
     this.audit(old?'booking-updated':'booking-imported',id);
     if(old)this.review({id:'changed-'+id,kind:'Booking changed',title:job.client,detail:'A date, title, service, property or status changed. Check the job before acting.',jobId:id,source,status:'open',updatedAt:new Date().toISOString()},true);
    }
    if(job.issues.length)this.review({id:'parse-'+id,kind:'Check booking',title:job.client||'Client needs review',detail:job.issues.join('. '),jobId:id,source,status:'open',updatedAt:new Date().toISOString()});
   }
   if(options.full){const ids=new Set(events.map(e=>e.id));for(const old of previous)if(!ids.has(old.sourceId)&&(!options.window||Date.parse(old.start)<Date.parse(options.window.to)&&Date.parse(old.end)>Date.parse(options.window.from))){
    this.review({id:'missing-'+old.id,kind:'Missing from source',title:old.client,detail:'Not in the latest full snapshot. Check deletion, date range or a moved booking; it has not been erased.',jobId:old.id,source,status:'open',updatedAt:new Date().toISOString()});
   }}
   if(options.state)this.setSync(options.state);
   this.enrichBookings();
   // Run after enrichment so cancelled floor-plan evidence unlinks first.
   for(const {job,linkedJobId} of deletions){
    const protectedIds=[job.id,...(linkedJobId?[linkedJobId]:[])].filter(id=>this.invoices().some(i=>i.jobId===id)||this.completions().some(c=>c.jobId===id));
    const at=new Date().toISOString();
    this.setSetting('calendar-deletion-'+job.id,JSON.stringify({source,eventId:job.sourceId,observedAt:at,outcome:protectedIds.length?'protected-review':'recently-deleted',protectedIds}));
    if(protectedIds.length){
     for(const id of new Set([job.id,...protectedIds])){const target=this.jobs().find(j=>j.id===id)!;this.review({id:'calendar-cancel-'+job.id+'-'+id,kind:'Calendar cancellation',jobId:id,title:target.client,source,detail:'Google explicitly reports this calendar booking deleted/cancelled. An invoice draft or completed record is linked, so the job and all financial records were retained. Review the cancellation; no invoice, payment or fee was changed.',status:'open',updatedAt:at},true);}
     this.audit('calendar-deletion-protected',job.id);
    }else if(!this.deletedJobIds().has(job.id)){this.deleteJob(job.id);this.audit('calendar-deletion-auto-trashed',job.id);}
   }
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
