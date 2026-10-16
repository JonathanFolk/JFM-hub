import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Store} from './store.ts';
import {gmailAccessToken} from './gmail.ts';
import {config} from './config.ts';

export type ReviewMapping={number:string;draftId:string;threadId:string;draftMessageId?:string;deliveryMessageId?:string};
type Part={mimeType?:string;filename?:string;body?:{data?:string;attachmentId?:string;size?:number};parts?:Part[]};
type Message={id?:string;threadId?:string;labelIds?:string[];payload?:Part&{headers?:{name:string;value:string}[]}};
type Draft={id?:string;message?:Message};
export type ReviewItem={number:string;draftId:string;threadId:string;messageId?:string;state:'ready'|'missing'|'changed-thread'|'unavailable'|'possibly-sent'|'needs-association'|'ambiguous';version?:string;subject?:string;to?:string;cc?:string;body?:string;filename?:string;deliverySubject?:string;deliveryFrom?:string;deliveryDate?:string;attachment?:boolean;warning?:string;gmailUrl:string;source:'mapped'|'discovered'};
const base='https://gmail.googleapis.com/gmail/v1/users/me';
const header=(message:Message|undefined,name:string)=>message?.payload?.headers?.find(h=>h.name.toLowerCase()===name)?.value||'';
const parts=(part:Part|undefined):Part[]=>part?[part,...(part.parts||[]).flatMap(parts)]:[];
const body=(message:Message)=>{const part=parts(message.payload).find(p=>p.mimeType==='text/plain'&&p.body?.data);return part?.body?.data?Buffer.from(part.body.data,'base64url').toString('utf8').slice(0,50000):'';};
const version=(message:Message)=>createHash('sha256').update(JSON.stringify({id:message.id,threadId:message.threadId,payload:message.payload})).digest('hex');
export function reviewMappings():ReviewMapping[]{
 const path=process.env.INVOICE_REVIEW_MAPPING_FILE;if(!path)return [];
 const value:unknown=JSON.parse(readFileSync(path,'utf8'));
 if(!Array.isArray(value)||value.length>100)throw new Error('Invalid private invoice review mapping.');
 const entries=value as ReviewMapping[];
 if(entries.some(x=>!x||!/^\d{5,8}$/.test(x.number)||!/^[-\w]+$/.test(x.draftId)||!/^[-\w]+$/.test(x.threadId)||x.draftMessageId!==undefined&&!/^[-\w]+$/.test(x.draftMessageId)||x.deliveryMessageId!==undefined&&!/^[-\w]+$/.test(x.deliveryMessageId))||new Set(entries.map(x=>x.draftId)).size!==entries.length)throw new Error('Invalid private invoice review mapping.');
 return entries;
}
export function allReviewMappings(store:Store):ReviewMapping[]{
 const entries=reviewMappings(),seen=new Set(entries.map(entry=>entry.draftId));
 const links=store.db.prepare("SELECT invoice_id,draft_id,thread_id,delivery_message_id FROM invoice_email_drafts WHERE state='created' AND draft_id IS NOT NULL AND thread_id IS NOT NULL AND delivery_message_id IS NOT NULL").all() as {invoice_id:string;draft_id:string;thread_id:string;delivery_message_id:string}[];
 for(const link of links){const invoice=store.invoice(link.invoice_id),number=invoice?.pdfDetails?.reference;if(!number||seen.has(link.draft_id))continue;entries.push({number,draftId:link.draft_id,threadId:link.thread_id,deliveryMessageId:link.delivery_message_id});seen.add(link.draft_id);}
 return entries;
}
export async function gmailGet<T>(path:string,token:string,fetcher:typeof fetch=fetch):Promise<T|null>{
 const response=await fetcher(`${base}/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
 if(response.status===404)return null;
 if(!response.ok)throw new Error('Gmail could not be read. Check the read-only connection.');
 return await response.json() as T;
}
export async function reviewItem(mapping:ReviewMapping,token:string,fetcher:typeof fetch=fetch):Promise<ReviewItem>{
 const gmailUrl=`https://mail.google.com/mail/?authuser=${encodeURIComponent(config.businessEmail)}#drafts/${encodeURIComponent(mapping.threadId)}`;
 const item:ReviewItem={number:mapping.number,draftId:mapping.draftId,threadId:mapping.threadId,state:'unavailable',gmailUrl,source:'mapped'};
 const draft=await gmailGet<Draft>(`drafts/${encodeURIComponent(mapping.draftId)}?format=full`,token,fetcher);
 const thread=await gmailGet<{messages?:Message[]}>(`threads/${encodeURIComponent(mapping.threadId)}?format=metadata`,token,fetcher);
 const sent=thread?.messages?.filter(message=>message.labelIds?.includes('SENT')&&message.id!==draft?.message?.id)||[];
 const inReplyTo=header(draft?.message,'in-reply-to');
 const delivery=sent.find(message=>message.id===mapping.deliveryMessageId||!!inReplyTo&&header(message,'message-id')===inReplyTo)||sent.find(message=>!/\bInvoice\b/i.test(header(message,'subject')))||sent[0];
 if(delivery?.threadId===mapping.threadId){item.deliverySubject=header(delivery,'subject');item.deliveryFrom=header(delivery,'from');item.deliveryDate=header(delivery,'date');}
 if(!draft?.message){
  item.state='missing';item.warning='This draft is no longer in Gmail Drafts. It may have been deleted or sent; check Gmail before taking action.';
  for(const sentMessage of sent){
   if(sentMessage.id===mapping.draftMessageId||mapping.number&&new RegExp(`\\b${mapping.number}\\b`).test(header(sentMessage,'subject'))){item.state='possibly-sent';break;}
   if(!mapping.number||!sentMessage.id)continue;
   const full=await gmailGet<Message>(`messages/${encodeURIComponent(sentMessage.id)}?format=full`,token,fetcher);
   if(parts(full?.payload).some(part=>/\.pdf$/i.test(part.filename||'')&&invoiceNumber(part.filename||'')===mapping.number)){item.state='possibly-sent';break;}
  }
  if(item.state==='possibly-sent')item.warning='A sent message with this invoice number appears in the delivery thread. Verify it in Gmail; Hub has not marked the invoice sent or paid.';
  return item;
 }
 const message=draft.message,pdfs=parts(message.payload).filter(p=>p.mimeType==='application/pdf'||/\.pdf$/i.test(p.filename||''));
 item.messageId=message.id;item.version=version(message);item.subject=header(message,'subject');item.to=header(message,'to');item.cc=header(message,'cc');item.body=body(message);item.filename=pdfs.length===1?pdfs[0].filename||'':'Multiple PDFs';item.attachment=pdfs.length===1;
 item.state=message.threadId===mapping.threadId?'ready':'changed-thread';
 if(mapping.draftMessageId&&mapping.draftMessageId!==message.id)item.warning='The draft message ID changed since import. Review this edited draft and its PDF carefully.';
 if(item.state==='changed-thread')item.warning='The Gmail draft is no longer in the mapped delivery thread. Review it in Gmail.';
 if(pdfs.length>1){item.state='ambiguous';item.warning='Multiple PDF attachments are present. Review the intended invoice in Gmail.';}
 else if(!item.attachment)item.warning='The current Gmail draft has no PDF attachment. Review it in Gmail.';
 else if(invoiceNumber(item.filename||'')!==mapping.number){item.state='needs-association';item.warning='The PDF invoice number cannot be verified against this mapped draft. Review it in Gmail before associating it.';}
 return item;
}
const jfmPdf=(part:Part)=>/\.pdf$/i.test(part.filename||'')&&(/\bJonathan Folk Media\.pdf$/i.test(part.filename||'')||/\bJFM[\s_-]*Invoice\b/i.test(part.filename||''));
const invoiceNumber=(filename:string)=>filename.match(/\bInvoice[\s#:_-]*(\d{5,8})\b/i)?.[1]||'';
const deliverySubject=(value:string)=>/\bmedia\s+delivery\b/i.test(value);
type DraftPage={drafts?:{id?:string;message?:{id?:string;threadId?:string}}[];nextPageToken?:string};
export async function discoverInvoiceDrafts(token:string,knownIds:Set<string>,fetcher:typeof fetch=fetch):Promise<{items:ReviewItem[];incomplete:boolean}>{
 const ids:string[]=[];let pageToken='',incomplete=false;
 for(let page=0;page<10;page++){
  const query=new URLSearchParams({maxResults:'100',q:'filename:pdf',includeSpamTrash:'false'});if(pageToken)query.set('pageToken',pageToken);
  const response=await gmailGet<DraftPage>(`drafts?${query}`,token,fetcher);
  for(const draft of response?.drafts||[])if(draft.id&&!knownIds.has(draft.id))ids.push(draft.id);
  pageToken=response?.nextPageToken||'';if(!pageToken)break;if(page===9)incomplete=true;
 }
 const items:ReviewItem[]=[];
 for(const id of ids){
  const draft=await gmailGet<Draft>(`drafts/${encodeURIComponent(id)}?format=full`,token,fetcher);
  const message=draft?.message;if(!message?.id||!message.threadId||message.labelIds?.includes('TRASH')||message.labelIds?.includes('SENT')||message.labelIds&&!message.labelIds.includes('DRAFT'))continue;
  const attachments=parts(message.payload).filter(jfmPdf);if(!attachments.length)continue;
  const numbers=[...new Set(attachments.map(part=>invoiceNumber(part.filename||'')).filter(Boolean))];
  const thread=await gmailGet<{messages?:Message[]}>(`threads/${encodeURIComponent(message.threadId)}?format=metadata`,token,fetcher);
  const sent=thread?.messages?.filter(item=>item.labelIds?.includes('SENT')&&deliverySubject(header(item,'subject')))||[];
  const replyTo=header(message,'in-reply-to');
  const delivery=sent.find(item=>!!replyTo&&header(item,'message-id')===replyTo)||(sent.length===1?sent[0]:undefined);
  const number=numbers.length===1?numbers[0]:'';
  const state=attachments.length>1||numbers.length>1?'ambiguous':!number||!delivery?'needs-association':'ready';
  const warning=state==='ambiguous'?'Multiple JFM invoice PDF attachments or invoice numbers were found. Open Gmail and choose the intended invoice; Hub did not associate this draft.':state==='needs-association'?'The invoice number or matching sent media-delivery message could not be verified. Review this draft in Gmail before associating it.':undefined;
  items.push({number,draftId:id,threadId:message.threadId,messageId:message.id,state,version:version(message),subject:header(message,'subject'),to:header(message,'to'),cc:header(message,'cc'),body:body(message),filename:attachments.length===1?attachments[0].filename:'Multiple PDFs',attachment:attachments.length===1,deliverySubject:delivery?header(delivery,'subject'):'',deliveryFrom:delivery?header(delivery,'from'):'',deliveryDate:delivery?header(delivery,'date'):'',warning,gmailUrl:`https://mail.google.com/mail/?authuser=${encodeURIComponent(config.businessEmail)}#drafts/${encodeURIComponent(message.threadId)}`,source:'discovered'});
 }
 return {items,incomplete};
}
export async function reviewQueueWithToken(store:Store,token:string,fetcher:typeof fetch=fetch):Promise<{items:ReviewItem[];incomplete:boolean}>{
 const mappings=allReviewMappings(store),items:ReviewItem[]=[];
 for(const mapping of mappings)items.push(await reviewItem(mapping,token,fetcher));
 const discovered=await discoverInvoiceDrafts(token,new Set(mappings.map(item=>item.draftId)),fetcher);
 items.push(...discovered.items);
 type Saved={draft_id:string;number:string;thread_id:string;message_id:string;baseline_version:string};
 const saved=store.db.prepare('SELECT draft_id,number,thread_id,message_id,baseline_version FROM invoice_discovered_drafts').all() as Saved[];
 const byId=new Map(saved.map(row=>[row.draft_id,row]));
 for(const item of discovered.items){
  const baseline=byId.get(item.draftId);
  if(baseline){
   if(baseline.number!==item.number||baseline.thread_id!==item.threadId){item.state='needs-association';item.warning='The invoice number or Gmail thread changed since first discovery. Review the association in Gmail.';}
   else if(baseline.baseline_version!==item.version)item.warning=[item.warning,'This Gmail draft has been edited since it was first discovered.'].filter(Boolean).join(' ');
   continue;
  }
  store.db.prepare('INSERT OR IGNORE INTO invoice_discovered_drafts VALUES(?,?,?,?,?,?)').run(item.draftId,item.number,item.threadId,item.messageId||'',item.version||'',new Date().toISOString());
 }
 if(!discovered.incomplete){
  const current=new Set(items.map(item=>item.draftId));
  for(const row of saved)if(!current.has(row.draft_id)){
   const missing=await reviewItem({number:row.number,draftId:row.draft_id,threadId:row.thread_id,draftMessageId:row.message_id},token,fetcher);
   missing.source='discovered';if(missing.state==='ready'){missing.state='needs-association';missing.warning='This draft no longer matches invoice PDF discovery. Review its attachment and thread in Gmail.';}
   items.push(missing);
  }
 }
 const counts=new Map<string,number>();for(const item of items)if(item.number&&item.state!=='missing'&&item.state!=='possibly-sent')counts.set(item.number,(counts.get(item.number)||0)+1);
 for(const item of items)if(item.number&&(counts.get(item.number)||0)>1){item.state='ambiguous';item.warning='More than one current Gmail draft uses this invoice number. Review both in Gmail; Hub will not choose one automatically.';}
 if(discovered.incomplete)for(const item of items)if(item.state==='ready'){item.state='needs-association';item.warning='Gmail draft discovery is incomplete, so a duplicate cannot be ruled out. Review in Gmail and refresh after narrowing the mailbox.';}
 return {items,incomplete:discovered.incomplete};
}
export async function reviewQueue(store:Store,fetcher:typeof fetch=fetch){return reviewQueueWithToken(store,await gmailAccessToken(store),fetcher);}
export async function deliveryCandidates(store:Store,term:string,fetcher:typeof fetch=fetch){
 const safe=term.replace(/["{}()\r\n]/g,' ').trim().slice(0,100);if(safe.length<5)return [];
 const token=await gmailAccessToken(store),query=new URLSearchParams({q:`in:sent "${safe}"`,maxResults:'15'});
 const list=await gmailGet<{messages?:{id:string}[]}>(`messages?${query}`,token,fetcher);
 const messages=await Promise.all((list?.messages||[]).map(row=>gmailGet<Message>(`messages/${encodeURIComponent(row.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=To&metadataHeaders=Date`,token,fetcher)));
 return messages.filter((message):message is Message=>!!message?.id&&!!message.threadId&&!!header(message,'message-id')&&!!header(message,'subject')).map(message=>({messageId:message.id!,threadId:message.threadId!,rfcMessageId:header(message,'message-id'),references:header(message,'references'),subject:header(message,'subject'),to:header(message,'to'),date:header(message,'date')}));
}
export async function reviewPdf(mapping:ReviewMapping,token:string,expectedVersion:string,fetcher:typeof fetch=fetch):Promise<{bytes:Buffer;filename:string}>{
 const draft=await gmailGet<Draft>(`drafts/${encodeURIComponent(mapping.draftId)}?format=full`,token,fetcher);
 if(!draft?.message||draft.message.threadId!==mapping.threadId||version(draft.message)!==expectedVersion)throw new Error('This Gmail draft changed. Refresh the review before opening its PDF.');
 const attachments=parts(draft.message.payload).filter(part=>part.mimeType==='application/pdf'||/\.pdf$/i.test(part.filename||''));
 if(attachments.length!==1)throw new Error('The current Gmail draft must have exactly one PDF attachment for preview.');
 const part=attachments[0];
 const data=part.body?.data||(part.body?.attachmentId?(await gmailGet<{data?:string}>(`messages/${encodeURIComponent(draft.message.id||'')}/attachments/${encodeURIComponent(part.body.attachmentId)}`,token,fetcher))?.data:undefined);
 if(!data)throw new Error('The PDF attachment could not be read.');
 const bytes=Buffer.from(data,'base64url');if(bytes.subarray(0,5).toString()!=='%PDF-'||bytes.length>15_000_000)throw new Error('The attachment is not a valid reviewable PDF.');
 return {bytes,filename:part.filename||`Invoice-${mapping.number}.pdf`};
}
