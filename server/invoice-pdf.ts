import PDFDocument from 'pdfkit';
import {invoiceServiceDescription} from './invoice-service-description.ts';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DateTime} from 'luxon';
import {invoiceTotals,type InvoiceDraftInput} from './invoicing.ts';

// InDesign reference: olive corner/ribbon, grey paper, two-column service table.
// No client data, tax registration IDs or licensed font files are embedded here.
export function validatePdfInput(invoice:InvoiceDraftInput){
 const errors:string[]=[];
 if(invoice.pdfDetails&&Object.entries(invoice.pdfDetails).some(([key,value])=>value.split(/\r?\n/).length>(key==='paymentNote'?12:8)))errors.push('Keep billing fields to eight lines and payment instructions to twelve lines or fewer.');
 if(!invoice.client||!invoice.property)errors.push('Add the billing client and property.');
 if(!invoice.invoiceDate||!invoice.dueDate)errors.push('Add valid invoice and due dates.');
 if(invoice.taxTreatment==='review')errors.push('Confirm the tax treatment before exporting.');
 if(invoice.lines.some(line=>!line.description.trim()))errors.push('Every PDF line needs a description.');
 if(!invoice.pdfDetails?.business.trim())errors.push('Add your business details for the PDF.');
 // The embedded font does not cover all Unicode scripts. Fail visibly
 // rather than silently corrupting a name/address; embedded fonts can follow.
 const text=[invoice.client,invoice.property,...invoice.lines.map(line=>line.description),...Object.values(invoice.pdfDetails||{})].join('');
 if(/[^\u0009\u000a\u000d\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/u.test(text))errors.push('This PDF template currently supports Latin characters only. Use a Latin spelling for this draft.');
 return errors;
}
const singleLine=(value:string)=>value.replace(/\s+/g,' ').trim();
export const pdfLineDescription=(description:string,property:string,appendProperty=true)=>{description=singleLine(description);if(!appendProperty)return description;property=singleLine(property);return description.endsWith(` - ${property}`)?description:`${description} - ${property}`;};
export type InvoicePdfFonts={regular:string;bold:string;medium?:string};
export function configuredInvoiceFonts():InvoicePdfFonts|null{
 const directory=process.env.INVOICE_FONT_DIR;if(!directory)return null;
 const fonts={regular:join(directory,'GothamSSm-Light.otf'),bold:join(directory,'GothamSSm-Bold.otf'),medium:join(directory,'GothamSSm-Medium.otf')};
 return Object.values(fonts).every(path=>existsSync(path))?fonts:null;
}
export async function renderInvoicePdf(invoice:InvoiceDraftInput,fonts?:InvoicePdfFonts):Promise<Buffer>{
 const doc=new PDFDocument({size:'LETTER',margin:0,bufferPages:true,info:{Title:'Invoice - Jonathan Folk Media',Author:'Jonathan Folk Media',Subject:'Invoice'}});
 doc.registerFont('Invoice',fonts?.regular||fileURLToPath(new URL('./assets/fonts/LiberationSans-Regular.ttf',import.meta.url)));
 doc.registerFont('Invoice-Bold',fonts?.bold||fileURLToPath(new URL('./assets/fonts/LiberationSans-Bold.ttf',import.meta.url)));
 doc.registerFont('Invoice-Medium',fonts?.medium||fonts?.bold||fileURLToPath(new URL('./assets/fonts/LiberationSans-Bold.ttf',import.meta.url)));
 const chunks:Buffer[]=[];const output=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const cmyk=(c:number,m:number,y:number,k:number):[number,number,number,number]=>[c,m,y,k];
 const gray=cmyk(8,6,6,0),olive=cmyk(60,39,80,21),ink=cmyk(0,0,0,100),blue=cmyk(100,90,10,0);
 const write=(value:string,x:number,y:number,width:number,size=11,bold=false,align:'left'|'center'|'right'='left')=>{doc.fillColor(ink).font(bold?'Invoice-Bold':'Invoice').fontSize(size).text(value,x,y,{width,align,lineGap:size*1.2-doc.currentLineHeight()});};
 const height=(value:string,width:number,size=11)=>doc.font('Invoice').fontSize(size).heightOfString(value,{width,lineGap:size*1.2-doc.currentLineHeight()});
 const money=(cents:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:invoice.currency}).format(cents/100);
 const amount=(value:string,x:number,y:number,width:number,size=11,bold=false,align:'left'|'center'|'right'='right')=>{doc.font(bold?'Invoice-Bold':'Invoice').fontSize(size);const fitted=Math.min(size,size*width/doc.widthOfString(value));write(value,x,y,width,fitted,bold,align);};
 const date=(value:string)=>DateTime.fromISO(value).toFormat('MMM d/yy');
 const base=()=>{
  doc.rect(0,0,612,792).fill(gray);doc.moveTo(0,0).lineTo(118.717,0).lineTo(0,118.717).closePath().fill(olive);
  doc.moveTo(66.374,792).lineTo(122,736.294).lineTo(612,736.294).lineTo(612,792).closePath().fill(olive);
  write('Jonathan Folk',156,756.0168,100,12,true);
  doc.image(fileURLToPath(new URL('./assets/phone.png',import.meta.url)),263.8,754.4,{width:18.0225,height:18.0225});
  write('(778) 708-5335',287,756.0168,108,12,true);
  doc.image(fileURLToPath(new URL('./assets/email.png',import.meta.url)),406,753.8,{width:19.224,height:19.224});
  write('info@jonathanfolk.ca',432,756.0168,144,12,true);

 };
 base();write('INVOICE',72,65.3574,340,41,true);doc.image(fileURLToPath(new URL('./assets/jfm-logo.png',import.meta.url)),418.5504,49.2,{width:157.4496,height:86.4103});
 const details=invoice.pdfDetails!;
 write(details.business,72,124.2977,310,12);let y=Math.max(215.0398,124.2977+height(details.business,310,12)+18);
 write('ISSUED',72,y,300,16,true);y+=30.9751;
 const billTo=[singleLine(invoice.client),details.billTo].filter(Boolean).join('\n');write(billTo,72,y,310,12);y+=height(billTo,310,12)+24;
 const metadata=[['Invoice No.',singleLine(details.reference)||'Unnumbered'],['Date Issued',date(invoice.invoiceDate)],['Due Date',date(invoice.dueDate)]];
 metadata.forEach(([label,value],i)=>{const top=[164.2799,209.0799,254.4799][i];write(label,460.8,top,79.2,12,true,'center');doc.strokeColor(ink).lineWidth(.5).moveTo(460.8,[179.41,224.75,269.85][i]).lineTo(540,[179.41,224.75,269.85][i]).stroke();amount(value,460.8,[183.4799,228.5799,273.9799][i],79.2,12,false,'center');});
 y=Math.max(389.868,y);
 doc.strokeColor(ink).lineWidth(.5).moveTo(70.29,y-25.9).lineTo(538.29,y-25.9).stroke();
 const borders=(top:number,bottom:number,header=false)=>{
  doc.strokeColor(ink).lineWidth(.5).moveTo(72,top).lineTo(72,bottom).moveTo(540.42,top).lineTo(540.42,bottom).stroke();
  doc.lineWidth(1).moveTo(460.42,top).lineTo(460.42,bottom).stroke();
  doc.strokeColor(blue).lineWidth(header?1:.5).moveTo(72,bottom).lineTo(540.42,bottom).stroke();
 };
 const tableHeader=()=>{doc.rect(72,y,468.42,30).fill(olive);write('Description',78,y+8.0798,376.42,12,true,'center');write('Total',460.42,y+8.0798,80,12,true,'center');doc.strokeColor(blue).lineWidth(.5).moveTo(72,y).lineTo(540.42,y).stroke();borders(y,y+30,true);y+=30;};
 const next=()=>{doc.addPage();base();write('INVOICE / CONTINUED',72,75,468,22,true);y=120;};
 if(y>570)next();tableHeader();
 for(const line of invoice.lines){
  const description=(line.appendProperty===false?singleLine(line.description):invoiceServiceDescription(line.description,invoice.property,(line.pricingProfileOverride||invoice.pricingProfile)==='legacy',line.appendProperty))+(line.quantity!==1?`\n${line.quantity} x ${money(line.unitPriceCents)}`:'');
  const row=Math.max(30,height(description,370.42,10)+15.6,height(money(line.quantity*line.unitPriceCents),75,10)+15.6);
  if(y+row>690){next();tableHeader();}
  doc.rect(72,y,468.42,row).fill('#ffffff');doc.strokeColor(blue).lineWidth(1).moveTo(72.25,y).lineTo(540.42,y).stroke();write(description,81,y+9.2798,370.42,10,false,'center');amount(money(line.quantity*line.unitPriceCents),464.42,y+9.2798,72,10,false,'center');
  borders(y,y+row);y+=row;
 }
 doc.strokeColor(ink).lineWidth(.5).moveTo(72,y).lineTo(540.42,y).stroke();
 y+=15.9;
 const terms=details.paymentNote;const termsHeight=terms?height(terms,275,10)+12:40;
 if(y+Math.max(termsHeight,120)>720){next();}
 doc.fillColor(ink).font('Invoice-Medium').fontSize(10).text('Settlement of Invoice',72.29,y,{width:275});
 const days=DateTime.fromISO(invoice.dueDate).diff(DateTime.fromISO(invoice.invoiceDate),'days').days;
 write(terms||`Net ${days} days`,72.29,y+12,275,10);
 const total=invoiceTotals(invoice);
 write('Subtotal',350,y,108.77,10,true,'right');amount(money(total.subtotalCents),460,y,80,10);
 write(invoice.taxTreatment==='taxable'?`GST (${invoice.taxRateBps/100}%)`:'Tax (off)',350,y+17.06,108.77,10,true,'right');amount(money(total.taxCents),460,y+17.06,80,10);
 doc.strokeColor(ink).lineWidth(.5).moveTo(459.66,y+36.0).lineTo(540.06,y+36.0).stroke();
 doc.rect(460.52,y+45.91,78.92,29.24).fillAndStroke('#ffffff',ink);write('Balance Due',350,y+52.24,107.62,12,true,'right');amount(money(total.totalCents),464.52,y+52.24,70.92,12,true,'center');

 doc.end();return output;
}
