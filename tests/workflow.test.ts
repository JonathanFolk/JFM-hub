import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';
import {parseBooking} from '../server/parser.ts';
import {extractArea,normalizeSortDetails} from '../server/workflow.ts';
import {googleEvent,readICS,calendarWindow} from '../server/calendar.ts';
import {rateSuggestions} from '../server/rates.ts';
import {sheetReadError} from '../server/invoicing-sheet.ts';
import {streetCity} from '../src/review-display.ts';
import {DateTime} from 'luxon';
const raw=(id='a',title='PS Test Client',description='2,400 sqft')=>({id,title,description,start:'2026-09-25T10:00:00-07:00',end:'2026-09-25T11:00:00-07:00',location:'Unit 3, 123 Test St, Vancouver, BC V1V 1V1, Canada'});
function sort(store:Store,category:'Real Estate'|'Commercial',range='',details={}){const job=store.jobs()[0];store.review({id:'sort',jobId:job.id,title:job.client,kind:'Sort shoot',detail:'Choose service',source:job.source,status:'open',updatedAt:'now'},true);store.sortReview('sort',category,range,'',details);return store.invoices()[0];}

test('notes retain descriptions and reject conflicting or ancillary area',()=>{
 assert.equal(googleEvent({id:'x',description:'<b>2400 sqft</b>'}).description,'<b>2400 sqft</b>');
 for(const text of ['2400sf','2,400 sq ft','2.4k sqft','2,400 square feet'])assert.equal(extractArea(text).area,2400);
 assert.equal(extractArea('Lot: 8000 sqft; house: 2400 sqft').area,2400);
 assert.ok(extractArea('2400 sqft; 3600 sqft').areaIssue);
 assert.ok(extractArea('approximately 2400 sqft').areaIssue);
 assert.ok(extractArea('<1000 sqft').areaIssue);
 const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test\r\nDTSTART:20260925T170000Z\r\nDTEND:20260925T180000Z\r\nSUMMARY:PS Test Client\r\nDESCRIPTION:2400 sqft\r\nEND:VEVENT\r\nEND:VCALENDAR';assert.equal(readICS(ics)[0].description,'2400 sqft');
});
test('explicit per-image quantities and a labeled note address can fill a draft',()=>{
 const s=new Store(':memory:');try{s.apply('test',[{...raw('a','PS Test Client','2400 sqft\nAddress: 123 Test St, Vancouver\nVirtual staging: 3 images'),location:''}]);const invoice=s.invoices()[0];assert.equal(invoice.property,'123 Test St, Vancouver');const staging=invoice.lines.find(l=>l.description==='Virtual Staging')!;assert.equal(staging.quantity,3);assert.equal(staging.unitPriceCents,3000);assert.equal(parseBooking(raw('hold','PS HOLD Test Client'),'test')?.status,'Unconfirmed');}finally{s.close();}
});
test('provisional title variants never auto-draft, while cancellation wins',()=>{
 const store=new Store(':memory:');try{for(const marker of ['HOLD','TENTATIVE','TENTITIVE','WEATHER','WHEATHER','TBR','TBD','RESCHEUDLE']){const e=raw(marker,`${marker} PS Test Client`);assert.equal(parseBooking(e,'test')?.status,'Unconfirmed');store.apply('test',[e]);}assert.equal(store.invoices().length,0);assert.equal(parseBooking({...raw(),'title':'HOLD PS Test Client',status:'cancelled'},'test')?.status,'Cancelled');assert.equal(parseBooking(raw('normal','PS Test Client','Weather was fine. 2400 sqft'),'test')?.status,'Booked');}finally{store.close();}
});
test('clear RE area and explicit drone package create one correctly priced draft',()=>{
 const s=new Store(':memory:');try{s.apply('test',[raw('a','PS DR Test Client','2,400 sqft. Essentials aerial drone requested.')]);assert.equal(s.sorts()[0].squareFootageRange,'Under 2,500 sq ft');const draft=s.invoices()[0];assert.equal(draft.squareFeet,'2400');assert.deepEqual(draft.lines.map(l=>[l.description,l.unitPriceCents]),[['Premium photo',35000],['Essentials Aerial Drone (<6 Photos)',20000]]);s.apply('test',[raw('a','PS DR Test Client','2,400 sqft. Essentials aerial drone requested.')]);assert.equal(s.invoices().length,1);assert.equal(s.invoices()[0].lines.length,2);}finally{s.close();}
});
test('generic drone and unknown quantities stay unpriced, optional drone is excluded',()=>{
 const s=new Store(':memory:');try{s.apply('test',[raw('a','PS DR Test Client','2400 sqft. Virtual staging requested.')]);assert.equal(s.invoices()[0].lines.find(l=>l.description==='Drone')?.unitPriceCents,0);assert.equal(s.invoices()[0].lines.find(l=>l.description==='Virtual Staging')?.unitPriceCents,0);assert.ok(!parseBooking(raw('b','PS Test Client','2400 sqft. Optional drone if required.'),'test')!.services.includes('Drone'));}finally{s.close();}
});
test('image packages are prices rather than square footage and replace generic photo',()=>{
 for(const [choice,amount] of [['Up to 5 images only',20000],['Up to 10 images only',30000]] as const){const s=new Store(':memory:');try{s.apply('test',[raw('a','PS Test Client','')]);const invoice=sort(s,'Real Estate',choice);assert.equal(invoice.lines.length,1);assert.equal(invoice.lines[0].unitPriceCents,amount);assert.match(invoice.lines[0].description,/Editorial\/Premium/);}finally{s.close();}}
});
test('exact area preserves boundary ambiguity and Basic/Premium distinction',()=>{
 for(const [service,area,expected] of [['BP',1000,0],['PS',2500,0],['BP',2500,25500],['BP',999,22500],['PS',7501,0]] as const){const s=new Store(':memory:');try{s.apply('test',[raw('a',`${service} Test Client`,`${area} sqft`)]);assert.equal(s.invoices()[0].lines[0].unitPriceCents,expected,`${service} ${area}`);}finally{s.close();}}
});
test('commercial components calculate quantities and keep Interior Design L in review',()=>{
 const s=new Store(':memory:');try{s.apply('test',[raw('a','PS Design Client','')]);const details=normalizeSortDetails({commercialSubtype:'Commercial Exterior',imageCount:8,retouchCount:2,twilight:true,drone:true});const invoice=sort(s,'Commercial','',details);assert.equal(invoice.lines.reduce((a,l)=>a+l.quantity*l.unitPriceCents,0),101000);assert.equal(invoice.pricingProfileMode,'invoice');assert.throws(()=>normalizeSortDetails({commercialSubtype:'Commercial Exterior',imageCount:5,retouchCount:6}));}finally{s.close();}
 const s2=new Store(':memory:');try{s2.apply('test',[raw('a','PS Design Client','')]);const invoice=sort(s2,'Commercial','',normalizeSortDetails({commercialSubtype:'Interior Design L',commercialPackage:'half'}));assert.equal(invoice.lines[0].unitPriceCents,125000);assert.ok(s2.reviews().some(r=>r.kind==='Confirm image allowance'&&r.status==='open'));}finally{s2.close();}
});
test('new evidence enriches but never reprices edited lines or revives removed add-ons',()=>{
 const s=new Store(':memory:');try{s.apply('test',[raw()]);const draft=s.invoices()[0];s.saveInvoice({...draft,lines:draft.lines.map(l=>({...l,unitPriceCents:99900}))},draft.updatedAt);s.apply('test',[raw('a','PS Test Client','2400 sqft. Essentials aerial drone requested.')]);let next=s.invoices()[0];assert.equal(next.lines[0].unitPriceCents,99900);assert.equal(next.lines.length,2);s.saveInvoice({...next,lines:next.lines.slice(0,1)},next.updatedAt);s.apply('test',[raw('a','PS Test Client','2400 sqft. Essentials aerial drone requested. Confirmed access.')]);next=s.invoices()[0];assert.equal(next.lines.length,1);assert.equal(next.lines[0].unitPriceCents,99900);}finally{s.close();}
});
test('3D Elevate links only FP for Jon/J at a unique unit/address/date',()=>{
 const s=new Store(':memory:');try{s.apply('primary',[raw()]);s.apply('floor',[raw('fp','FP for Jon','2400 sqft')],{contractor:'3D Elevate'});assert.equal(s.jobs().find(j=>j.source==='floor')?.supportingJobId,s.jobs().find(j=>j.source==='primary')?.id);assert.equal(s.invoices().length,1);assert.equal(s.invoices()[0].lines.filter(l=>l.description==='Floor plan').length,1);s.apply('floor',[raw('fp','FP for J','2400 sqft')],{contractor:'3D Elevate'});assert.equal(s.invoices()[0].lines.filter(l=>l.description==='Floor plan').length,1);assert.equal(parseBooking(raw('bad','FP for Jane'),'floor',undefined,'3D Elevate'),null);assert.equal(parseBooking(raw('bad','PS for J'),'floor',undefined,'3D Elevate'),null);}finally{s.close();}
});
test('floor-plan cancellation unlinks evidence and flags the existing draft without changing prices',()=>{
 const s=new Store(':memory:');try{s.apply('primary',[raw()]);s.apply('floor',[raw('fp','FP for Jon','')],{contractor:'3D Elevate'});const before=s.invoices()[0].lines;s.apply('floor',[{...raw('fp',''),status:'cancelled'}],{contractor:'3D Elevate'});assert.equal(s.jobs().find(j=>j.source==='floor')?.supportingJobId,undefined);assert.deepEqual(s.invoices()[0].lines,before);assert.ok(s.reviews().some(r=>r.kind==='Floor plan changed'));}finally{s.close();}
});
test('bounded refresh keeps older backlog and excludes unrelated out-of-window events',()=>{
 const s=new Store(':memory:');try{s.apply('test',[{...raw(),start:'2026-01-01T12:00:00Z',end:'2026-01-01T13:00:00Z'}]);s.apply('test',[],{full:true,window:{from:'2026-09-01',to:'2027-03-01'}});assert.equal(s.jobs().length,1);assert.ok(!s.reviews().some(r=>r.kind==='Missing from source'));s.apply('test',[{...raw('other'),start:'2028-01-01',end:'2028-01-02'}],{window:{from:'2026-09-01',to:'2027-03-01'}});assert.equal(s.jobs().length,1);const window=calendarWindow(DateTime.fromISO('2026-09-26T12:00:00-07:00'));assert.ok(window.from.startsWith('2026-09-12'));assert.ok(window.to.startsWith('2027-03-26'));}finally{s.close();}
});
test('Sheet errors distinguish disabled API, scope and generic denial without leaking raw messages',()=>{
 assert.match(sheetReadError(403,{error:{details:[{reason:'SERVICE_DISABLED'}],message:'secret'}}),/API is disabled/);assert.match(sheetReadError(403,{error:{details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}}),/permission/);assert.match(sheetReadError(403,{}),/does not necessarily mean/);assert.ok(!sheetReadError(403,{error:{message:'secret'}}).includes('secret'));assert.equal(streetCity('Suite 204, 123 Test St, Vancouver, BC V1V 1V1, Canada'),'Suite 204, 123 Test St, Vancouver');
});
