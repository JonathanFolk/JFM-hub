import React,{useEffect,useRef,useState} from 'react';
import type {InvoiceDraft} from '../server/types';

export function InvoiceEmailDraft({invoice}:{invoice:InvoiceDraft}){
 const [candidates,setCandidates]=useState<{messageId:string;threadId:string;subject:string;to:string;date:string}[]>([]),[deliveryId,setDeliveryId]=useState('');
 const [to,setTo]=useState(''),[cc,setCc]=useState(''),[greeting,setGreeting]=useState('');
 const [setupReady,setSetupReady]=useState(false),[connected,setConnected]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[gmailUrl,setGmailUrl]=useState(''),[busy,setBusy]=useState(false);const running=useRef(false);
 useEffect(()=>{setTo('');setCc('');setGreeting('');setConnected(false);setSetupReady(false);setStatus('');setError('');setGmailUrl('');setCandidates([]);setDeliveryId('');let active=true;void fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/email-draft`).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error||'Could not check Gmail drafts.');if(active){setConnected(value.connected);setSetupReady(value.templateConfigured&&value.fontsConfigured);}}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[invoice.id]);
 useEffect(()=>{if(!invoice.property.trim())return;let active=true;void fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/delivery-candidates`).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error||'Could not find delivery emails.');if(active)setCandidates(value);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[invoice.id,invoice.property]);
 const recipients=(text:string)=>text.split(/[,;\n]+/).map(value=>value.trim()).filter(Boolean);
 const prepare=async()=>{
  if(running.current)return;running.current=true;setBusy(true);setError('');setStatus('');
  try{const delivery=candidates.find(item=>item.messageId===deliveryId);if(!delivery)throw new Error('Choose the matching media-delivery email first.');const response=await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/email-draft`,{method:'POST',headers:{'Content-Type':'application/json','X-JFM-Request':'1'},body:JSON.stringify({draft:invoice,email:{to:recipients(to),cc:recipients(cc),greetingName:greeting},delivery})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not prepare the draft.');setStatus(`${result.subject}: ${result.notice}`);setGmailUrl(result.gmailUrl);}catch(error){setError((error as Error).message);}finally{running.current=false;setBusy(false);}
 };
 return <section className="invoice-email-draft"><h3>Gmail draft</h3>
  <p className="caption">Prepare a reply to the matching media-delivery email with the named PDF attached. Review it in the queue and send directly from Gmail.</p>
  {!setupReady?<p className="caption">The private email template and original invoice fonts must be installed before connecting Gmail drafts.</p>:!connected?<div className="setup-note"><p>Gmail drafts needs a separate connection. Google calls this permission “Manage drafts and send emails.” Hub uses it only to create review drafts; your current read-only connection stays separate.</p><a className="button secondary" href="/auth/start?kind=gmail-drafts">Connect Gmail drafts with Google</a></div>:<>
  <label>To (verified email addresses)<input value={to} onChange={event=>setTo(event.target.value)} placeholder="Separate addresses with commas"/></label>
  <label>Cc (optional)<input value={cc} onChange={event=>setCc(event.target.value)}/></label>
  <label>First name for a single correspondent<input value={greeting} maxLength={80} onChange={event=>setGreeting(event.target.value)}/></label>
  <label>Media-delivery email<select value={deliveryId} onChange={event=>setDeliveryId(event.target.value)}><option value="">Choose the matching sent email</option>{candidates.map(item=><option key={item.messageId} value={item.messageId}>{item.subject} · {item.to} · {item.date}</option>)}</select></label>
  {!candidates.length&&<p className="caption">No sent email matched this property. Check the property name or review the thread in Gmail before preparing a draft.</p>}
  <p className="caption">Multiple To/Cc correspondents are greeted as “team”; your own account does not count.</p>
  <button className="secondary wide" type="button" disabled={busy||!deliveryId} onClick={()=>void prepare()}>{busy?'Preparing Gmail draft…':'Prepare reply + PDF in Gmail Drafts'}</button>
  </>}
  {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status} {gmailUrl&&<a href={gmailUrl} target="_blank" rel="noopener noreferrer">Open Gmail Drafts</a>}</p>}
 </section>;
}
