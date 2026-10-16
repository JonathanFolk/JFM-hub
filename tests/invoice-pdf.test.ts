import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInvoiceInput,invoiceTotals} from '../server/invoicing.ts';
import {renderInvoicePdf,validatePdfInput,pdfLineDescription} from '../server/invoice-pdf.ts';

export const pdfFixture=()=>normalizeInvoiceInput({client:'Synthetic Client',property:'123 Test Street',currency:'CAD',invoiceDate:'2026-10-15',dueDate:'2026-11-14',taxTreatment:'taxable',taxRateBps:500,notes:'PRIVATE NOTE MUST NOT PRINT',pdfDetails:{business:'Example Media\ninfo@example.test',billTo:'Example Realty\nclient@example.test',reference:'TEST-001',paymentNote:'Payment details to confirm'},lines:[{id:'photo',description:'Premium Photos <2500sf',quantity:1,unitPriceCents:35000},{id:'floor',description:'2D Floor Plans',quantity:1,unitPriceCents:18985}]});
test('PDF uses precise invoice totals, property suffix, and send-ready format',async()=>{
 const input=pdfFixture(),before=JSON.stringify(input);assert.deepEqual(validatePdfInput(input),[]);assert.deepEqual(invoiceTotals(input),{subtotalCents:53985,taxCents:2699,totalCents:56684});
 assert.equal(pdfLineDescription('Photos','123 Test Street'),'Photos - 123 Test Street');assert.equal(pdfLineDescription('Photos - 123 Test Street','123 Test Street'),'Photos - 123 Test Street');
 const pdf=await renderInvoicePdf(input);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>2000);assert.equal(JSON.stringify(input),before);
});
test('PDF validates required fields, unresolved tax and unsupported glyphs',()=>{
 const input=pdfFixture();assert.ok(validatePdfInput({...input,taxTreatment:'review'}).length);assert.ok(validatePdfInput({...input,client:'測試'}).length);assert.ok(validatePdfInput({...input,invoiceDate:''}).length);assert.ok(validatePdfInput({...input,pdfDetails:undefined}).length);assert.ok(validatePdfInput({...input,pdfDetails:{...input.pdfDetails!,billTo:'x\n'.repeat(10)}}).length);
});
test('PDF handles maximum rows and long wrapping descriptions',async()=>{
 const input=pdfFixture();input.lines=Array.from({length:25},(_,i)=>({id:String(i),description:'Long service description '.repeat(6),quantity:100,unitPriceCents:100_000_000}));input.property='Long property name '.repeat(10);const pdf=await renderInvoicePdf(input);assert.ok(pdf.length>3000);
});
test('production font configuration does not silently choose substitute fonts',async()=>{
 const {configuredInvoiceFonts}=await import('../server/invoice-pdf.ts');const previous=process.env.INVOICE_FONT_DIR;
 try{delete process.env.INVOICE_FONT_DIR;assert.equal(configuredInvoiceFonts(),null);process.env.INVOICE_FONT_DIR='/nonexistent-jfm-font-fixture';assert.equal(configuredInvoiceFonts(),null);}finally{if(previous===undefined)delete process.env.INVOICE_FONT_DIR;else process.env.INVOICE_FONT_DIR=previous;}
});
test('default settlement wording is the explicitly approved August text',async()=>{
 const {DEFAULT_INVOICE_PAYMENT_TERMS}=await import('../server/invoice-template.ts');assert.ok(DEFAULT_INVOICE_PAYMENT_TERMS.startsWith('Jonathan accepts EMT or Cheques.\n'));assert.ok(DEFAULT_INVOICE_PAYMENT_TERMS.endsWith('compounded monthly, the annual rate is 79.59%'));assert.ok(!DEFAULT_INVOICE_PAYMENT_TERMS.includes('19.57%'));assert.equal(DEFAULT_INVOICE_PAYMENT_TERMS.split('\n').length,10);
});

test('PDF default has no review or reservation markings and uses 10pt item rows',async()=>{const {readFileSync}=await import('node:fs');const source=readFileSync('server/invoice-pdf.ts','utf8');for(const phrase of ['DRAFT - FOR REVIEW ONLY','Reference not reserved','Review copy only','Invoice number reserved'])assert.ok(!source.includes(phrase));assert.ok(source.includes("write(description,81,y+9.2798,370.42,10,false,'center')"));assert.ok(source.includes("amount(money(line.quantity*line.unitPriceCents),464.42,y+9.2798,72,10,false,'center')"));});
test('four service rows and full settlement fit without an unnecessary extra page',async()=>{const {DEFAULT_INVOICE_PAYMENT_TERMS}=await import('../server/invoice-template.ts');const input=pdfFixture();input.pdfDetails!.paymentNote=DEFAULT_INVOICE_PAYMENT_TERMS;input.lines=Array.from({length:4},(_,i)=>({id:String(i),description:'Synthetic service',quantity:1,unitPriceCents:10000}));const pdf=await renderInvoicePdf(input);assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1);});

test('additional deliverables can omit property suffix explicitly through normalization',()=>{const input=normalizeInvoiceInput({...pdfFixture(),lines:[{id:'reel',description:'Legacy - Reel',quantity:1,unitPriceCents:12500,appendProperty:false}]});assert.equal(input.lines[0].appendProperty,false);assert.equal(pdfLineDescription(input.lines[0].description,input.property,input.lines[0].appendProperty),'Legacy - Reel');assert.equal(pdfLineDescription('Photos','123 Test Street'),'Photos - 123 Test Street');});

test('approved service catalog uses legacy prefixes and conditional addresses without conflating drone services',async()=>{const {invoiceServiceDescription:f}=await import('../server/invoice-service-description.ts');assert.equal(f('Premium Photos <2500sf','Address',true),'(Legacy) Premium RE Photos <2500sf - Address');assert.equal(f('Reel','Address',true),'(Legacy) IG Reel - Additional Deliverable');assert.equal(f('Intro Talking','Address',true),'(Legacy) Basic Intro Audio Walk + Talk');assert.equal(f('2D Floor Plans','Address'),'2D Floorplans - Address');assert.equal(f('Basic Photos 2501–3500sf','Address'),'Basic RE Photos 2501–3500sf - Address');assert.equal(f('Aerial Drone Photo Video (1 Flight)','Address',true,true),'(Legacy) Aerial Drone Photo Video (1 Flight) - Address');assert.equal(f('Neighborhood Video + Drone 15<x<60min','Address',true),'(Legacy) Neighborhood Video + Drone 15<x<60min');assert.equal(f('Custom service','Address'),'Custom service');});
