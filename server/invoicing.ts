import {DateTime} from 'luxon';
import type {InvoiceDraft,InvoiceLine,Job,Review} from './types.ts';

export type InvoiceDraftInput=Omit<InvoiceDraft,'id'|'jobId'|'createdAt'|'updatedAt'>;

const text=(value:unknown,_max:number)=>typeof value==='string'?value.trim():'';
const isoDate=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&DateTime.fromISO(value).isValid?value:'';

export function invoiceTotals(invoice:Pick<InvoiceDraft,'lines'|'taxTreatment'|'taxRateBps'>){
 const subtotalCents=invoice.lines.reduce((sum,line)=>sum+line.quantity*line.unitPriceCents,0);
 const taxCents=invoice.taxTreatment==='taxable'?Math.round(subtotalCents*invoice.taxRateBps/10000):0;
 return {subtotalCents,taxCents,totalCents:subtotalCents+taxCents};
}

export function normalizeInvoiceInput(value:unknown):InvoiceDraftInput{
 const raw=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const lines:InvoiceLine[]=Array.isArray(raw.lines)?raw.lines.slice(0,25).map((item,index):InvoiceLine=>{
  const line=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;
  return {id:text(line.id,80)||`line-${index+1}`,description:text(line.description,160),quantity:Number(line.quantity),unitPriceCents:Number(line.unitPriceCents),pricingProfileOverride:line.pricingProfileOverride==='standard'||line.pricingProfileOverride==='legacy'?line.pricingProfileOverride:null};
 }):[];
 return {
  status:raw.status==='ready'?'ready':'draft',client:text(raw.client,120),property:text(raw.property,200),squareFeet:text(raw.squareFeet,50),pricingProfile:raw.pricingProfile==='standard'||raw.pricingProfile==='legacy'?raw.pricingProfile:'review',pricingProfileMode:raw.pricingProfileMode==='invoice'?'invoice':'automatic',
  currency:raw.currency==='USD'?'USD':'CAD',invoiceDate:isoDate(raw.invoiceDate),dueDate:isoDate(raw.dueDate),completionConfirmed:raw.completionConfirmed===true,
  taxTreatment:raw.taxTreatment==='taxable'?'taxable':raw.taxTreatment==='no-tax'?'no-tax':'review',taxRateBps:Number(raw.taxRateBps)||0,taxNote:text(raw.taxNote,500),
  lines,notes:text(raw.notes,2000)
 };
}

export function validateInvoiceDraft(input:InvoiceDraftInput,job:Job,openReviews:Review[],now=DateTime.now().setZone('America/Vancouver')){
 const errors:string[]=[];
 if(input.client.length<2)errors.push('Add the billing client.');
 if(input.client.length>120)errors.push('The billing client is too long.');
 if(input.property.length<2)errors.push('Add the property or project.');
 if(input.property.length>200)errors.push('The property or project is too long.');
 if(input.squareFeet.length>50)errors.push('The square-footage note is too long.');
 if(!input.invoiceDate||!input.dueDate)errors.push('Use valid invoice and due dates.');
 else if(input.dueDate<input.invoiceDate)errors.push('The due date cannot be before the invoice date.');
 if(!input.lines.length)errors.push('Add at least one invoice line.');
 for(const line of input.lines){
  if(line.description.length<2)errors.push('Every line needs a description.');
  if(line.description.length>160||line.id.length>80)errors.push('An invoice line is too long.');
  if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>100)errors.push('Line quantities must be whole numbers from 1 to 100.');
  if(!Number.isInteger(line.unitPriceCents)||line.unitPriceCents<0||line.unitPriceCents>100_000_000)errors.push('Line prices must be valid non-negative amounts.');
 }
 if(!Number.isInteger(input.taxRateBps)||input.taxRateBps<0||input.taxRateBps>10_000)errors.push('The tax rate must be between 0% and 100%.');
 if(input.taxTreatment!=='taxable'&&input.taxRateBps!==0)errors.push('Only taxable drafts can have a tax rate.');
 if(input.taxNote.length>500||input.notes.length>2000)errors.push('An invoice note is too long.');
 if(input.status==='ready'){
  if(input.lines.some(line=>!line.pricingProfileOverride&&input.pricingProfile==='review'))errors.push('Confirm Standard or Legacy pricing for every invoice line before marking the draft ready.');
  if(job.status!=='Booked')errors.push('Only a booked job can be made ready for invoicing.');
  if(DateTime.fromISO(job.start).setZone('America/Vancouver')>now)errors.push('A future job cannot be made ready for invoicing.');
  if(!input.completionConfirmed)errors.push('Confirm that the job was completed.');
  if(!input.squareFeet)errors.push('Record approximate square footage or explain why it is not applicable.');
  if(input.lines.some(line=>line.unitPriceCents<=0))errors.push('Ready drafts require a positive price on every line.');
  if(input.taxTreatment==='review')errors.push('Choose an explicit tax treatment before marking the draft ready.');
  if(input.taxNote.length<3)errors.push('Record the reason for the selected tax treatment.');
  if(openReviews.length)errors.push('Resolve this job’s open review items before marking the draft ready.');
 }
 return [...new Set(errors)];
}

export function newInvoiceInput(job:Job,now=DateTime.now().setZone('America/Vancouver')):InvoiceDraftInput{
 const invoiceDate=now.toISODate()!;
 return {status:'draft',client:job.client,property:job.location,squareFeet:'',pricingProfile:'review',pricingProfileMode:'automatic',currency:'CAD',invoiceDate,dueDate:now.plus({days:30}).toISODate()!,completionConfirmed:false,taxTreatment:'review',taxRateBps:0,taxNote:'',lines:(job.services.length?job.services:['Service to confirm']).map((description,index):InvoiceLine=>({id:`line-${index+1}`,description,quantity:1,unitPriceCents:0,pricingProfileOverride:null})),notes:''};
}
