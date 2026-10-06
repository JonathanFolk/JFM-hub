import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';
import {newInvoiceInput,invoiceTotals,validateInvoiceDraft} from '../server/invoicing.ts';
import {completionMatches,masterRows} from '../server/completion.ts';
import {groupRates} from '../src/rate-groups.ts';
import {DateTime} from 'luxon';
const event={id:'qol',title:'PS Test Client',start:'2026-08-01T10:00:00-07:00',end:'2026-08-01T11:00:00-07:00',location:'123 Test Street, Vancouver, BC, Canada'};
test('manual catalogue is reversible and preserves prior reviews and invoices',()=>{
 const s=new Store(':memory:');try{s.apply('test',[event]);const before=s.catalogueSnapshot(s.jobs()[0].id);const result=s.catalogue(s.jobs()[0].id,'Commercial','','',{commercialSubtype:'Developer Residential',commercialPackage:'staged'});assert.equal(result.invoice?.lines[0].unitPriceCents,75000);assert.equal(result.invoice?.taxRateBps,500);s.undoCatalogue(result.undoToken);assert.deepEqual(s.catalogueSnapshot(s.jobs()[0].id),before);assert.throws(()=>s.undoCatalogue(result.undoToken));}finally{s.close();}
});
test('catalogue undo refuses to overwrite subsequent invoice edits',()=>{
 const s=new Store(':memory:');try{s.apply('test',[event]);const result=s.catalogue(s.jobs()[0].id,'Real Estate','Under 2,500 sq ft','',{});const invoice=result.invoice!;s.saveInvoice({...invoice,notes:'Keep this edit'},invoice.updatedAt);assert.throws(()=>s.undoCatalogue(result.undoToken),/newer edits/);assert.equal(s.invoices()[0].notes,'Keep this edit');}finally{s.close();}
});
test('GST defaults to five percent and no-tax toggle does not charge GST',()=>{
 const s=new Store(':memory:');try{s.apply('test',[event]);const input=newInvoiceInput(s.jobs()[0]);input.lines[0].unitPriceCents=35000;assert.equal(invoiceTotals(input).taxCents,1750);assert.equal(invoiceTotals({...input,taxTreatment:'no-tax',taxRateBps:0}).taxCents,0);assert.deepEqual(validateInvoiceDraft({...input,client:'',property:'',lines:[{...input.lines[0],description:''}]},s.jobs()[0],[]),[]);}finally{s.close();}
});
test('rate display grouping retains every ID, profile, tier and price',()=>{
 const s=new Store(':memory:');try{const rates=s.rates(),groups=groupRates(rates);assert.equal(groups.length,44);assert.equal(groups.flat().length,98);assert.deepEqual(groups.flat().map(r=>r.id).sort(),rates.map(r=>r.id).sort());assert.equal(groups.find(g=>g[0].service==='Premium photo')?.length,10);}finally{s.close();}
});
test('completion requires a unique invoiced row, full address and client, not a checkbox alone',()=>{
 const s=new Store(':memory:');try{s.apply('test',[event]);const job=s.jobs()[0];const serial=DateTime.fromISO('2026-08-04').diff(DateTime.fromISO('1899-12-30'),'days').days;
 const rows=masterRows([[serial,26001,'Test Client',350,17.5,367.5,false,'123 Test St'],[serial,26002,'Someone Else','VOID','VOID','VOID',true,'123 Test St'],[null,null,'Test Client',null,null,null,true,'123 Test St']]);assert.equal(rows.length,1);assert.equal(completionMatches([job],rows).length,1);assert.equal(completionMatches([job],rows)[0].row.paid,false);assert.equal(completionMatches([job,{...job,id:'other'}],rows).length,0);assert.equal(completionMatches([{...job,location:'Unit 2, 123 Test St'}],rows).length,0);assert.equal(completionMatches([job],[{...rows[0],date:'2026-07-01'}]).length,0);assert.equal(completionMatches([job],[{...rows[0],notes:'Test St'}]).length,0);
 }finally{s.close();}
});
