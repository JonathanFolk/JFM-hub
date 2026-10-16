import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {DateTime} from 'luxon';
import type {InvoiceDraft} from './types.ts';

export type InvoiceEmailDetails={to:string[];cc:string[];greetingName:string};
export type InvoiceEmailTemplate={subject:string;body:string;html:string};
export type PreparedInvoiceEmail={to:string[];cc:string[];subject:string;body:string;html:string;filename:string;messageId:string;raw:string;fingerprint:string;threadId?:string;deliveryMessageId?:string};
export type InvoiceReplyContext={threadId:string;deliveryMessageId:string;subject:string;messageId:string;references:string};
import {invoicePdfFilename} from './invoice-template.ts';
export {invoicePdfFilename} from './invoice-template.ts';
export function loadInvoiceEmailTemplate():InvoiceEmailTemplate{
 if(!process.env.INVOICE_EMAIL_TEMPLATE_FILE)throw new Error('The verified invoice email template has not been installed privately.');
 const value=JSON.parse(readFileSync(process.env.INVOICE_EMAIL_TEMPLATE_FILE,'utf8'));
 if(typeof value.subject!=='string'||typeof value.body!=='string'||typeof value.html!=='string'||value.subject.length>200||value.body.length>30000||value.html.length>60000)throw new Error('The invoice email template is invalid.');return value;
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const email=(value:string)=>/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value)&&value.length<=254;
const encoded=(value:string)=>{const chunks:string[]=[];let chunk='';for(const character of value){if(Buffer.byteLength(chunk+character)>42){chunks.push(chunk);chunk='';}chunk+=character;}if(chunk)chunks.push(chunk);return chunks.map(part=>`=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`).join('\r\n ');};
const attachmentHeader=(filename:string)=>{const units=encodeURIComponent(filename).replace(/['()*]/g,character=>'%'+character.charCodeAt(0).toString(16).toUpperCase()).match(/%[0-9A-F]{2}|./g)||[];const chunks:string[]=[];for(let i=0;i<units.length;i+=15)chunks.push(units.slice(i,i+15).join(''));return 'Content-Disposition: attachment;\r\n '+chunks.map((chunk,index)=>`filename*${index}*=${index===0?"UTF-8''":''}${chunk}`).join(';\r\n ');};
const lines64=(bytes:Buffer)=>bytes.toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
export function prepareInvoiceEmail(invoice:InvoiceDraft,details:InvoiceEmailDetails,template:InvoiceEmailTemplate,pdf:Buffer,sender:string,reply?:InvoiceReplyContext):PreparedInvoiceEmail{
 if(!email(sender))throw new Error('The business sender address is invalid.');
 if(!details||!Array.isArray(details.to)||!Array.isArray(details.cc)||typeof details.greetingName!=='string'||details.to.length+details.cc.length>20)throw new Error('Choose up to 20 verified To and Cc recipients.');
 const to=[...new Set(details.to.map(value=>typeof value==='string'?value.trim().toLowerCase():''))],cc=[...new Set(details.cc.map(value=>typeof value==='string'?value.trim().toLowerCase():''))].filter(value=>!to.includes(value));
 if(!to.length||[...to,...cc].some(value=>!email(value)))throw new Error('Enter valid recipient email addresses.');
 const contacts=[...to,...cc].filter(value=>value!==sender.toLowerCase());if(!contacts.length)throw new Error('Choose the intended client recipients.');
 const greeting=contacts.length>1?'team':details.greetingName.trim();
 if(!greeting||greeting.length>80||/[\u0000-\u001f<>]/.test(greeting))throw new Error('Add a single-recipient greeting name.');
 const reference=invoice.pdfDetails?.reference?.trim();if(!reference||reference.length>40||/[\u0000-\u001f]/.test(reference))throw new Error('Add a provisional invoice reference before preparing an email draft.');
 if(!invoice.property.trim()||/[\r\n]/.test(invoice.property))throw new Error('Add the property or project on one line.');
 const days=DateTime.fromISO(invoice.dueDate).diff(DateTime.fromISO(invoice.invoiceDate),'days').days;if(!Number.isInteger(days)||days<0)throw new Error('Confirm valid invoice and due dates.');
 if(typeof template.html!=='string'||!['Hi ___!','assignment at _____!','net ____ fashion.'].every(value=>template.html.includes(value))||template.subject!=='New Invoice ____ - Jonathan Folk Media'||!template.body.includes('Hi ___!')||!template.body.includes('assignment at _____!')||!template.body.includes('net ____ fashion.'))throw new Error('The installed template does not match the verified invoice template.');
 const subject=reply?`${/^re:/i.test(reply.subject)?'':'Re: '}${reply.subject}`:template.subject.replace('____',()=>reference),body=template.body.replace('Hi ___!',()=>`Hi ${greeting}!`).replace('assignment at _____!',()=>`assignment at ${invoice.property}!`).replace('net ____ fashion.',`net ${days} fashion.`);
 const html=template.html.replace('Hi ___!',()=>`Hi ${escapeHtml(greeting)}!`).replace('assignment at _____!',()=>`assignment at ${escapeHtml(invoice.property)}!`).replace('net ____ fashion.',()=>`net ${days} fashion.`);
 const filename=invoicePdfFilename(invoice);if(pdf.subarray(0,5).toString()!=='%PDF-'||pdf.length>10_000_000)throw new Error('A valid invoice PDF is required.');
 // Fingerprint the semantic invoice, not PDF bytes (whose creation timestamp varies).
 const fingerprint=createHash('sha256').update(JSON.stringify({to,cc,subject,body,html,filename,reply,pdf:{pricingProfile:invoice.pricingProfile,client:invoice.client,property:invoice.property,currency:invoice.currency,invoiceDate:invoice.invoiceDate,dueDate:invoice.dueDate,taxTreatment:invoice.taxTreatment,taxRateBps:invoice.taxRateBps,lines:invoice.lines.map(({description,quantity,unitPriceCents,appendProperty,pricingProfileOverride})=>({description,quantity,unitPriceCents,appendProperty,pricingProfileOverride})),pdfDetails:invoice.pdfDetails}})).digest('hex');
 const key=createHash('sha256').update(invoice.id).digest('hex'),messageId=`<jfm-invoice-${key}@jonathanfolk.ca>`,boundary=`jfm_${fingerprint}`,alternative=`alt_${fingerprint}`;
 if(reply&&(!/^[-\w]+$/.test(reply.threadId)||!/^<[^<>\r\n]+>$/.test(reply.messageId)||/[\r\n]/.test(reply.subject+reply.references)))throw new Error('Choose a verified media-delivery message.');
 const raw=[`From: ${sender}`,`To: ${to.join(',\r\n ')}`,...(cc.length?[`Cc: ${cc.join(',\r\n ')}`]:[]),`Subject: ${encoded(subject)}`,`Message-ID: ${messageId}`,...(reply?[`In-Reply-To: ${reply.messageId}`,`References: ${[...new Set([...(reply.references.match(/<[^<>\r\n]+>/g)||[]),reply.messageId])].join(' ')}`]:[]),'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,`Content-Type: multipart/alternative; boundary="${alternative}"`,'',`--${alternative}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',lines64(Buffer.from(body)),`--${alternative}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',lines64(Buffer.from(html)),`--${alternative}--`,`--${boundary}`,'Content-Type: application/pdf',attachmentHeader(filename),'Content-Transfer-Encoding: base64','',lines64(pdf),`--${boundary}--`,''].join('\r\n');
 return {to,cc,subject,body,html,filename,messageId,raw:Buffer.from(raw).toString('base64url'),fingerprint,threadId:reply?.threadId,deliveryMessageId:reply?.deliveryMessageId};
}

type DraftRecord={invoice_id:string;fingerprint:string;state:'creating'|'created'|'uncertain'|'rejected';draft_id:string|null;message_id:string|null};
export function initializeInvoiceEmailDrafts(db:DatabaseSync){db.exec('CREATE TABLE IF NOT EXISTS invoice_email_drafts(invoice_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,state TEXT NOT NULL,draft_id TEXT,message_id TEXT,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS invoice_review_notes(number TEXT PRIMARY KEY,version TEXT NOT NULL,note TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS invoice_discovered_drafts(draft_id TEXT PRIMARY KEY,number TEXT NOT NULL,thread_id TEXT NOT NULL,message_id TEXT NOT NULL,baseline_version TEXT NOT NULL,first_seen TEXT NOT NULL); CREATE TABLE IF NOT EXISTS invoice_review_sends(draft_id TEXT PRIMARY KEY,number TEXT NOT NULL,thread_id TEXT NOT NULL,version TEXT NOT NULL,confirmation_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN (\'prepared\',\'sending\',\'blocked\',\'uncertain\',\'sent\')),expires_at INTEGER NOT NULL,sent_message_id TEXT,updated_at TEXT NOT NULL)');const fields=new Set((db.prepare('PRAGMA table_info(invoice_email_drafts)').all() as {name:string}[]).map(x=>x.name));if(!fields.has('thread_id'))db.exec('ALTER TABLE invoice_email_drafts ADD COLUMN thread_id TEXT');if(!fields.has('delivery_message_id'))db.exec('ALTER TABLE invoice_email_drafts ADD COLUMN delivery_message_id TEXT');}
export async function createInvoiceEmailDraft(db:DatabaseSync,invoiceId:string,prepared:PreparedInvoiceEmail,token:string,fetcher:typeof fetch=fetch){
 const previous=db.prepare('SELECT * FROM invoice_email_drafts WHERE invoice_id=?').get(invoiceId) as DraftRecord|undefined;
 if(previous&&previous.state!=='rejected'){
  if(previous.state==='created'&&previous.fingerprint===prepared.fingerprint){
   const check=await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(previous.draft_id!)}?format=minimal`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
   if(!check.ok)throw new Error(check.status===404?'The previous Gmail draft is no longer in Drafts; it may have been sent or deleted. It was not recreated.':'Could not verify the existing Gmail draft. No new draft was created.');
   const existing=await check.json();if(existing.id!==previous.draft_id||!existing.message?.id)throw new Error('Could not verify the existing Gmail draft.');
   return {draftId:previous.draft_id!,messageId:String(existing.message.id),reused:true};
  }
  throw new Error(previous.state==='created'?'A Gmail draft already exists for this invoice. Review it in Gmail; it was not replaced or duplicated.':'An earlier draft attempt needs review in Gmail before another attempt. No duplicate was created.');
 }
 const inserted=previous?.state==='rejected'?db.prepare("UPDATE invoice_email_drafts SET fingerprint=?,state='creating',updated_at=? WHERE invoice_id=? AND state='rejected'").run(prepared.fingerprint,new Date().toISOString(),invoiceId):db.prepare("INSERT OR IGNORE INTO invoice_email_drafts(invoice_id,fingerprint,state,draft_id,message_id,updated_at) VALUES(?,?,'creating',NULL,NULL,?)").run(invoiceId,prepared.fingerprint,new Date().toISOString());
 if(!inserted.changes)throw new Error('This invoice draft is already being prepared.');
 let response:Response;
 try{response=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({message:{raw:prepared.raw,...(prepared.threadId?{threadId:prepared.threadId}:{})}}),signal:AbortSignal.timeout(30000)});}catch{
  db.prepare("UPDATE invoice_email_drafts SET state='uncertain',updated_at=? WHERE invoice_id=?").run(new Date().toISOString(),invoiceId);throw new Error('Gmail did not confirm the result. Check Drafts before retrying; automatic retries are blocked to avoid duplicates.');
 }
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.id||!result?.message?.id){
  const rejected=!response.ok&&response.status>=400&&response.status<500;
  db.prepare('UPDATE invoice_email_drafts SET state=?,updated_at=? WHERE invoice_id=?').run(rejected?'rejected':'uncertain',new Date().toISOString(),invoiceId);
  throw new Error(rejected?'Gmail rejected draft creation. Check the draft connection and recipients, then click Prepare again. No automatic retry will occur.':'Gmail returned an uncertain result. Check Drafts; automatic retries are blocked to avoid duplicates.');
 }
 db.prepare("UPDATE invoice_email_drafts SET state='created',draft_id=?,message_id=?,thread_id=?,delivery_message_id=?,updated_at=? WHERE invoice_id=?").run(result.id,result.message.id,prepared.threadId||null,prepared.deliveryMessageId||null,new Date().toISOString(),invoiceId);
 return {draftId:String(result.id),messageId:String(result.message.id),reused:false};
}
