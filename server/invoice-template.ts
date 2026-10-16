import type {InvoiceDraft} from './types.ts';
// Owner approved the newer August wording on 2026-10-15.
export const DEFAULT_INVOICE_PAYMENT_TERMS='Jonathan accepts EMT or Cheques.\nDirect EMT payments to info@jonathanfolk.ca\nPlease mark your Invoice No. on the EMT.\nIssue cheques payable to “Jonathan Folk Media”.\nPlease mark your Invoice No. on the cheque.\nIf neither options work, please request for a\npayment link for fulfillment via credit card.\n\nCarrying charges after 30 days are 5% per month,\ncompounded monthly, the annual rate is 79.59%';

const cleanName=(value:string)=>value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,120);
export function invoicePdfFilename(invoice:Pick<InvoiceDraft,'client'|'pdfDetails'>){return `${cleanName(invoice.pdfDetails?.filenameClient||invoice.client)||'Client'} - Invoice ${cleanName(invoice.pdfDetails?.reference||'DRAFT')} - Jonathan Folk Media.pdf`;}
