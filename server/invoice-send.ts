import {createHash,randomBytes} from 'node:crypto';
import type {Store} from './store.ts';
import type {ReviewItem} from './invoice-review.ts';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const base='https://gmail.googleapis.com/gmail/v1/users/me';
type SendInput={number:string;draftId:string;version:string;confirmationId:string};
type SendRow={status:string;number:string;thread_id:string;version:string;confirmation_hash:string;expires_at:number};

export function sendEligibility(item:ReviewItem|undefined,store:Store):string|undefined{
 if(!item||item.state!=='ready'||!item.number||!item.version||!item.messageId||!item.attachment||!item.filename||!/^(?:re:\s*)?media\s+delivery\b/i.test(item.deliverySubject||''))return 'This draft or its media delivery thread needs review before sending.';
 if(item.otherAttachments)return 'This draft has another attachment. Review it in Gmail before sending.';
 if(item.bodyTruncated)return 'The email body is too long for a complete Hub review. Review and send it in Gmail.';
 if(!item.to?.trim()||!item.subject?.trim()||!item.body?.trim()||item.bodyHasOwnText===false)return 'The current recipients, subject, or plain-text body cannot be verified in Hub.';
 const note=store.db.prepare('SELECT version FROM invoice_review_notes WHERE number=?').get(item.number) as {version:string}|undefined;
 if(note?.version===item.version)return 'Changes were requested for this draft. Edit it in Gmail and refresh before sending.';
 return undefined;
}

export function prepareInvoiceSend(store:Store,item:ReviewItem){
 const problem=sendEligibility(item,store);if(problem)throw new Error(problem);
 const confirmationId=randomBytes(32).toString('base64url'),expiresAt=Date.now()+5*60_000;
 const result=store.db.prepare(`INSERT INTO invoice_review_sends(draft_id,number,thread_id,version,confirmation_hash,status,expires_at,sent_message_id,updated_at)
 VALUES(?,?,?,?,?,'prepared',?,NULL,?) ON CONFLICT(draft_id) DO UPDATE SET number=excluded.number,thread_id=excluded.thread_id,version=excluded.version,confirmation_hash=excluded.confirmation_hash,status='prepared',expires_at=excluded.expires_at,updated_at=excluded.updated_at
 WHERE invoice_review_sends.status IN ('prepared','blocked')`).run(item.draftId,item.number,item.threadId,item.version!,hash(confirmationId),expiresAt,new Date().toISOString());
 if(!result.changes)throw new Error('This draft already has a send attempt. Check Gmail before taking any further action.');
 return {confirmationId,expiresAt,number:item.number,draftId:item.draftId,threadId:item.threadId,version:item.version!,to:item.to!,cc:item.cc||'',bcc:item.bcc||'',subject:item.subject!,body:item.body!,bodyFromHtml:!!item.bodyFromHtml,filename:item.filename!};
}

export async function sendPreparedInvoice(store:Store,input:SendInput,loadCurrent:()=>Promise<ReviewItem|undefined>,composeToken:()=>Promise<string>,fetcher:typeof fetch=fetch){
 if(!/^\d{5,8}$/.test(input.number)||!/^[-\w]+$/.test(input.draftId)||!/^[a-f0-9]{64}$/.test(input.version)||!/^[A-Za-z0-9_-]{43}$/.test(input.confirmationId))throw new Error('Refresh the invoice and confirm again.');
 const row=store.db.prepare('SELECT status,number,thread_id,version,confirmation_hash,expires_at FROM invoice_review_sends WHERE draft_id=?').get(input.draftId) as SendRow|undefined;
 if(!row||row.status!=='prepared'||row.number!==input.number||row.version!==input.version||row.confirmation_hash!==hash(input.confirmationId)||row.expires_at<Date.now())throw new Error('This confirmation expired or was already used. Check Gmail and refresh.');
 const claimed=store.db.prepare("UPDATE invoice_review_sends SET status='sending',updated_at=? WHERE draft_id=? AND status='prepared' AND confirmation_hash=? AND expires_at>=?").run(new Date().toISOString(),input.draftId,row.confirmation_hash,Date.now());
 if(claimed.changes!==1)throw new Error('This draft already has a send attempt. Check Gmail before retrying.');
 let token:string;
 try{
  token=await composeToken();
  const current=await loadCurrent(),problem=sendEligibility(current,store);
  if(problem||current?.draftId!==input.draftId||current?.number!==input.number||current?.threadId!==row.thread_id||current?.version!==input.version)throw new Error(problem||'The draft changed after confirmation. Refresh and review it again.');
 }catch(error){store.db.prepare("UPDATE invoice_review_sends SET status='blocked',updated_at=? WHERE draft_id=? AND status='sending'").run(new Date().toISOString(),input.draftId);throw error;}
 try{
  // Gmail sends this immutable draft ID in its original thread. No new MIME message is built here.
  const response=await fetcher(`${base}/drafts/send`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({id:input.draftId}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Gmail did not confirm the send.');
  const result=await response.json() as {id?:string;threadId?:string};
  if(!result.id||result.threadId!==row.thread_id)throw new Error('Gmail returned an unexpected send result.');
  store.db.prepare("UPDATE invoice_review_sends SET status='sent',sent_message_id=?,updated_at=? WHERE draft_id=? AND status='sending'").run(result.id,new Date().toISOString(),input.draftId);
  return {sent:true,messageId:result.id,threadId:result.threadId};
 }catch{
  store.db.prepare("UPDATE invoice_review_sends SET status='uncertain',updated_at=? WHERE draft_id=? AND status='sending'").run(new Date().toISOString(),input.draftId);
  throw new Error('Gmail send outcome is uncertain. Check the original thread in Gmail. Hub will not retry this draft automatically.');
 }
}
