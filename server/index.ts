import express from 'express';
import {existsSync} from 'node:fs';
import {Store} from './store.ts';
import {config,validateConfig,validEncryptionKey} from './config.ts';
import {authRoutes,signedIn} from './auth.ts';
import {refreshCalendars,startScheduler,dailyBackup} from './sync.ts';
import {calendarSources,ensureCalendarSources,currentJobs,sourceId} from './calendar-sources.ts';
import {normalizeInvoiceInput,validateInvoiceDraft} from './invoicing.ts';
import {customPricePrompts,normalizeRate,rateSuggestions} from './rates.ts';
import {shootCategories,squareFootageRanges} from './types.ts';
import type {InvoiceDraft} from './types.ts';
import {commercialEmailPrices} from './gmail.ts';
import {syncInvoiceEvidence} from './reconciliation.ts';
import {pricingQuestions,referenceForClient} from './reference.ts';
import {normalizeSortDetails} from './workflow.ts';
validateConfig();const store=new Store(config.database);ensureCalendarSources(store);const app=express();
app.disable('x-powered-by');app.use(express.json({limit:'20kb'}));
app.use((req,res,next)=>{
 const origin=new URL(config.origin);
 if(req.headers.host!==origin.host)return res.sendStatus(403);
 res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com"});
 if(config.mode!=='local')res.set('Strict-Transport-Security','max-age=31536000');
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(req.headers.origin!==config.origin||req.headers['x-jfm-request']!=='1'))return res.status(403).json({error:'Request must come from this Hub.'});
 next();
});
if(config.preview)app.use('/auth',(_req,res)=>res.status(403).send('Google connections are disabled in this isolated preview.'));
authRoutes(app,store);
app.get('/healthz',(_req,res)=>res.json({ok:true}));
app.get('/api/session',(req,res)=>res.json({signedIn:signedIn(req,store),local:config.mode==='local',preview:config.preview,googleConfigured:!!config.clientId&&!!config.clientSecret&&validEncryptionKey()}));
app.use('/api',(req,res,next)=>signedIn(req,store)?next():res.status(401).json({error:'Sign in to open your Hub.'}));
app.get('/api/dashboard',(_req,res)=>{
 const active=store.getSetting('active-calendar')||'calendar-export';const jobs=currentJobs(store);const allowed=new Set(calendarSources().map(sourceId));const ids=new Set(jobs.map(j=>j.id));
 const deletedReviews=store.deletedReviewIds();const completions=store.completions().filter(c=>ids.has(c.jobId)),completedIds=new Set(completions.map(c=>c.jobId));res.json({jobs,completions,reviews:store.reviews().filter(r=>!deletedReviews.has(r.id)&&(!r.jobId||ids.has(r.jobId)&&(!completedIds.has(r.jobId)||r.kind==='Calendar cancellation'))),reconciliation:store.reconciliationSuggestions(),invoices:store.invoices().filter(invoice=>ids.has(invoice.jobId)&&!completedIds.has(invoice.jobId)),sorts:store.sorts().filter(sort=>ids.has(sort.jobId)),deletedItems:store.deletedItems(),rates:store.rates(),connections:store.syncs().filter(s=>config.preview||!s.id.startsWith('google-calendar')||allowed.has(s.id)).map(({syncToken,...state})=>state),mode:config.preview||active==='calendar-export'?'snapshot':'live',snapshotNote:store.getSetting('snapshot-note'),calendarConnected:!!store.getSetting('calendar-refresh'),gmailConnected:!!store.getSetting('gmail-refresh'),sheetsConnected:!!store.getSetting('sheets-refresh'),invoicingSpreadsheetId:config.invoicingSpreadsheetId,googleConfigured:!!config.clientId&&!!config.clientSecret&&validEncryptionKey(),secondaryBackupConfigured:!!config.secondaryBackupDir,now:new Date().toISOString(),lastBackup:store.sync('backup')?.lastSuccess||null});
});
app.post('/api/reconciliation/sync',async(req,res)=>{if(req.body?.rescan!==undefined&&typeof req.body.rescan!=='boolean')return res.status(400).json({error:'Invalid rescan option.'});try{res.json(await syncInvoiceEvidence(store,req.body?.rescan===true));}catch(error){res.status(503).json({error:error instanceof Error?error.message:'Invoice evidence sync failed.'});}});
app.post('/api/reconciliation/:id/review',(req,res)=>{const status=req.body?.status,resolution=req.body?.resolution??'';if(!['confirmed','dismissed'].includes(status)||typeof resolution!=='string'||resolution.length>1000)return res.status(400).json({error:'Choose Confirm or Dismiss and keep the note under 1,000 characters.'});try{res.json(store.resolveReconciliationSuggestion(String(req.params.id),status,resolution.trim()));}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Could not review suggestion.'});}});
app.get('/api/jobs/:id/history',(req,res)=>{const id=String(req.params.id);if(store.deletedJobIds().has(id))return res.status(404).json({error:'Restore this shoot from Recently Deleted first.'});res.json((store.db.prepare('SELECT at,payload FROM history WHERE job_id=? ORDER BY id DESC LIMIT 20').all(id) as {at:string,payload:string}[]).map(r=>({at:r.at,job:JSON.parse(r.payload)})));});
app.post('/api/reviews/:id',(req,res)=>{const {status,resolution=''}=req.body||{};if(!['reviewed','dismissed'].includes(status)||typeof resolution!=='string'||resolution.length>1000)return res.status(400).json({error:'The review note must be 1,000 characters or fewer.'});try{store.resolve(String(req.params.id),status,resolution.trim());res.json({ok:true});}catch{res.status(404).json({error:'Review item not found.'});}});
app.post('/api/reviews/:id/sort',(req,res)=>{
 const {category,squareFootageRange='',resolution=''}=req.body||{};
 if(!shootCategories.includes(category)||typeof squareFootageRange!=='string'||category==='Real Estate'&&!squareFootageRanges.includes(squareFootageRange)||category!=='Real Estate'&&squareFootageRange||typeof resolution!=='string'||resolution.length>1000)return res.status(400).json({error:'Choose a category and, for real estate, a square-footage range.'});
 try{const details=category==='Commercial'?normalizeSortDetails(req.body):{};store.sortReview(String(req.params.id),category,squareFootageRange,resolution.trim(),details);res.json({ok:true});}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Could not sort this item.'});}
});
app.post('/api/jobs/:id/sort',(req,res)=>{
 const job=store.jobs().find(j=>j.id===req.params.id);if(!job||store.deletedJobIds().has(job.id))return res.status(404).json({error:'Booking not found.'});
 const {category,squareFootageRange='',resolution=''}=req.body||{};if(!shootCategories.includes(category)||typeof squareFootageRange!=='string'||category==='Real Estate'&&!squareFootageRanges.includes(squareFootageRange)||category!=='Real Estate'&&squareFootageRange!==''||typeof resolution!=='string'||resolution.length>1000)return res.status(400).json({error:'Choose a category and package.'});
 try{const details=category==='Commercial'?normalizeSortDetails(req.body):{};res.json(store.catalogue(job.id,category,squareFootageRange,resolution.trim(),details));}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Could not sort booking.'});}
});
app.post('/api/complete/:id/reopen',(req,res)=>{try{store.reopenJob(String(req.params.id));res.json({ok:true});}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Could not reopen job.'});}});
app.post('/api/catalogue/undo',(req,res)=>{try{store.undoCatalogue(String(req.body?.token||''));res.json({ok:true});}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Could not undo selection.'});}});
app.post('/api/reviews/:id/delete',(req,res)=>{try{store.deleteReview(String(req.params.id));res.json({ok:true});}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Could not move this item to Recently Deleted.'});}});
app.post('/api/jobs/:id/delete',(req,res)=>{try{store.deleteJob(String(req.params.id));res.json({ok:true});}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Could not move this shoot to Recently Deleted.'});}});
app.post('/api/deleted/:id/restore',(req,res)=>{try{store.restoreReview(String(req.params.id));res.json({ok:true});}catch(error){res.status(404).json({error:error instanceof Error?error.message:'Deleted item not found.'});}});
app.post('/api/rates',(req,res)=>{try{const id=typeof req.body?.id==='string'?req.body.id:'';const existing=id?store.rates().find(rate=>rate.id===id):undefined;if(id&&!existing)return res.status(404).json({error:'Rate not found.'});res.json(store.saveRate(normalizeRate(req.body,existing)));}catch(error){res.status(400).json({error:error instanceof Error?error.message:'Invalid rate.'});}});
app.get('/api/reference/pricing-questions',(_req,res)=>res.json({questions:pricingQuestions(store),imports:store.referenceImports()}));
app.get('/api/invoices/:id/reference',(req,res)=>{const invoice=store.invoice(String(req.params.id));if(!invoice||store.deletedJobIds().has(invoice.jobId))return res.status(404).json({error:'Invoice draft not found.'});const job=store.jobs().find(item=>item.id===invoice.jobId),sort=store.sorts().find(item=>item.jobId===invoice.jobId);res.json(referenceForClient(store,String(req.query.client||invoice.client),job?.start.slice(0,10)||'',sort?.category));});
app.post('/api/invoices/:id/client-pricing',(req,res)=>{const invoice=store.invoice(String(req.params.id));if(!invoice||store.deletedJobIds().has(invoice.jobId))return res.status(404).json({error:'Invoice draft not found.'});const client=typeof req.body?.client==='string'?req.body.client:'';const profile=req.body?.profile;if(profile!==null&&profile!=='standard'&&profile!=='legacy')return res.status(400).json({error:'Choose Standard, Legacy, or clear the override.'});try{store.setClientPricingOverride(client,profile);const job=store.jobs().find(item=>item.id===invoice.jobId),sort=store.sorts().find(item=>item.jobId===invoice.jobId);res.json(referenceForClient(store,client,job?.start.slice(0,10)||'',sort?.category));}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Could not save client pricing.'});}});
app.get('/api/invoices/:id/suggestions',(req,res)=>{const invoice=store.invoice(String(req.params.id));if(!invoice||store.deletedJobIds().has(invoice.jobId))return res.status(404).json({error:'Invoice draft not found.'});const profile=String(req.query.profile||invoice.pricingProfile||'review');if(!['standard','legacy','review'].includes(profile))return res.status(400).json({error:'Invalid pricing profile.'});const sort=store.sorts().find(item=>item.jobId===invoice.jobId);const selected={...invoice,pricingProfile:profile as InvoiceDraft['pricingProfile']};res.json({rates:rateSuggestions(selected,sort,store.rates()),custom:customPricePrompts(selected,sort,store.guidance())});});
app.post('/api/invoices/:id/suggestions',(req,res)=>{const old=store.invoice(String(req.params.id));if(!old||store.deletedJobIds().has(old.jobId))return res.status(404).json({error:'Invoice draft not found.'});const input=normalizeInvoiceInput(req.body?.draft),selected=store.effectiveInvoicePricing({...old,...input},true);const sort=store.sorts().find(item=>item.jobId===old.jobId);res.json({profile:selected.pricingProfile,rates:rateSuggestions(selected,sort,store.rates()),custom:customPricePrompts(selected,sort,store.guidance())});});
app.get('/api/invoices/:id/email-prices',async(req,res)=>{
 const invoice=store.invoice(String(req.params.id));if(!invoice||store.deletedJobIds().has(invoice.jobId))return res.status(404).json({error:'Invoice draft not found.'});
 if(store.sorts().find(sort=>sort.jobId===invoice.jobId)?.category!=='Commercial')return res.status(409).json({error:'Email pricing suggestions are for commercial shoots.'});
 try{res.json(await commercialEmailPrices(store,invoice.client));}catch(error){res.status(503).json({error:error instanceof Error?error.message:'Gmail search failed.'});}
});
app.post('/api/invoices',(req,res)=>{
 const jobId=typeof req.body?.jobId==='string'?req.body.jobId:'';if(!jobId)return res.status(400).json({error:'Choose a job for this invoice draft.'});
 if(store.deletedJobIds().has(jobId))return res.status(409).json({error:'Restore this shoot from Recently Deleted first.'});
 try{res.status(201).json(store.createInvoice(jobId));}catch(error){const message=error instanceof Error?error.message:'Invoice draft could not be created.';res.status(message==='Job not found'?404:409).json({error:message});}
});
app.post('/api/invoices/:id',(req,res)=>{
 const old=store.invoice(String(req.params.id));if(!old)return res.status(404).json({error:'Invoice draft not found.'});
 if(store.deletedJobIds().has(old.jobId))return res.status(409).json({error:'Restore this shoot from Recently Deleted first.'});
 const job=store.jobs().find(item=>item.id===old.jobId);if(!job)return res.status(409).json({error:'The source job is no longer available.'});
 const input=normalizeInvoiceInput(req.body?.draft),effective=store.effectiveInvoicePricing({...old,...input},true),errors=validateInvoiceDraft(effective,job,store.reviews().filter(review=>review.jobId===job.id&&review.status==='open'));
 if(errors.length)return res.status(400).json({error:errors.join(' '),errors});
 try{res.json(store.saveInvoice({...old,...input},String(req.body?.expectedUpdatedAt||'')));}catch(error){res.status(409).json({error:error instanceof Error?error.message:'Invoice draft could not be saved.'});}
});
app.post('/api/refresh',async(_req,res)=>{if(!store.getSetting('calendar-refresh'))return res.status(409).json({error:'This is an imported snapshot. Connect Google Calendar to refresh live bookings.'});try{res.json(await refreshCalendars(store));}catch(e){res.status(503).json({error:e instanceof Error?e.message:'Refresh failed'});}});
app.post('/api/backup',async(_req,res)=>{try{await dailyBackup(store);res.json({ok:true});}catch{res.status(503).json({error:'Backup failed. Check disk space and permissions.'});}});
const dist=config.staticDir;if(!existsSync(dist))throw new Error('Build the interface before starting: pnpm build');
app.use('/api',(_req,res)=>res.status(404).json({error:'Unknown operation.'}));
app.use(express.static(dist,{index:false,dotfiles:'deny'}));
app.get('/{*path}',(_req,res)=>res.sendFile('index.html',{root:dist}));
app.use((_err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(500).json({error:'That operation could not finish. Your source records have not been changed.'}));
const scheduler=config.preview?undefined:startScheduler(store);
const server=app.listen(config.port,'127.0.0.1',()=>console.log(`JFM Hub ready at ${config.origin} (${config.mode})`));
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;clearInterval(scheduler);server.close(()=>{store.close();process.exit(0);});};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
