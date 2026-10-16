import {InvoiceEmailDraft} from './InvoiceEmailDraft';
import {DEFAULT_INVOICE_PAYMENT_TERMS,invoicePdfFilename} from '../server/invoice-template';
import React,{useRef,useState} from 'react';
import type {InvoiceDraft} from '../server/types';

export function InvoicePdfExport({invoice,editInvoice}:{invoice:InvoiceDraft;editInvoice:(changes:Partial<InvoiceDraft>)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false);
 const details=invoice.pdfDetails||{reference:'',billTo:'',business:'Jonathan Folk\nJonathan Folk Media\n(778) 708-5335\ninfo@jonathanfolk.ca',paymentNote:DEFAULT_INVOICE_PAYMENT_TERMS};
 const download=async()=>{
  if(running.current)return;running.current=true;setBusy(true);setError('');
  try{
   // Export this exact editor snapshot, including the latest unsaved keystroke.
   const response=await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`,{method:'POST',headers:{'Content-Type':'application/json','X-JFM-Request':'1'},body:JSON.stringify({draft:{...invoice,pdfDetails:details}})});
   if(!response.ok){const result=await response.json();throw new Error(result.error||'Could not generate the PDF.');}
   const blob=await response.blob();const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=invoicePdfFilename({...invoice,pdfDetails:details});document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){setError((error as Error).message);}finally{running.current=false;setBusy(false);}
 };
 const field=(key:keyof typeof details,value:string)=>editInvoice({pdfDetails:{...details,[key]:value}});
 return <section className="invoice-pdf-export"><h3>Invoice PDF</h3>
  <p className="caption">Download a send-ready PDF of the current form using the original GothamSSm fonts. Verify the invoice number and details before sending. Downloading does not reserve a number.</p>
  <div className="invoice-fields"><label>Invoice number<input value={details.reference} maxLength={40} onChange={e=>field('reference',e.target.value)}/></label>
  <label>Client or billing entity for PDF filename<input value={details.filenameClient||''} maxLength={120} placeholder={invoice.client} onChange={e=>field('filenameClient',e.target.value)}/></label>
  <label>Bill-to details<textarea value={details.billTo} maxLength={500} placeholder="Company, address, email and phone" onChange={e=>field('billTo',e.target.value)}/></label>
  <label>Business details<textarea value={details.business} maxLength={500} onChange={e=>field('business',e.target.value)}/></label>
  <label>Payment instructions (printed on PDF)<textarea value={details.paymentNote} maxLength={500} onChange={e=>field('paymentNote',e.target.value)}/></label></div>
  <p className="caption">Verify billing details before sharing. Private invoice notes and pricing evidence are excluded.</p>
  {error&&<p role="alert">{error}</p>}<button className="secondary wide" type="button" disabled={busy} onClick={()=>void download()}>{busy?'Generating PDF…':'Download invoice PDF'}</button>
  <InvoiceEmailDraft invoice={{...invoice,pdfDetails:details}}/>
 </section>;
}
