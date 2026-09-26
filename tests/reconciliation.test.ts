import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';
import {parseInvoiceSheet} from '../server/invoicing-sheet.ts';
import {extractReconciliationEvidence,matchEvidence} from '../server/reconciliation.ts';
import type {GmailMessage} from '../server/gmail.ts';
import type {ReconciliationSuggestion} from '../server/types.ts';

const values=[['Inv #','Client','Subtotal','Tax','Total','Paid','Notes'],[],['26087','Rising Sun',350,17.5,367.5,false,'Shoot'],['26116','TJ Almodovar',350,17.5,367.5,false,''],['26117','TJ Almodovar',200,10,210,true,''],['26118','Cameron Phillips',100,5,'',false,'']];
const rows=parseInvoiceSheet(values);
const mail=(id:string,labelIds:string[],subject:string,body:string):GmailMessage=>({id,threadId:'thread-'+id,labelIds,snippet:body.slice(0,100),payload:{mimeType:'text/plain',body:{data:Buffer.from(body).toString('base64url')},headers:[{name:'Subject',value:subject},{name:'From',value:'Interac <notify@example.test>'},{name:'Date',value:'Sat, 26 Sep 2026 12:00:00 -0700'}]}});

test('2026 Sheet parsing preserves rows, checkboxes, and missing totals',()=>{
 assert.equal(rows[0].row,7);assert.equal(rows[0].totalCents,36750);assert.equal(rows[2].paid,true);assert.equal(rows[3].totalCents,null);
 assert.throws(()=>parseInvoiceSheet([['Wrong','Client','','','Total','Paid']]),/columns changed/);
});
test('sent invoice and exact Interac memo become review evidence',()=>{
 const sent=extractReconciliationEvidence(mail('sent',['SENT'],'Invoice 26116','Invoice 26116 for $367.50 CAD'),rows);
 assert.equal(sent?.kind,'sent');assert.deepEqual(sent?.invoiceNumbers,['26116']);assert.equal(matchEvidence(sent!,rows).match,'invoice-number');
 const payment=extractReconciliationEvidence(mail('paid',['INBOX'],'Interac transfer received','Auto-deposited $210.00 CAD. Message: invoice 26117'),rows);
 assert.equal(payment?.kind,'payment');assert.equal(payment?.amountCents,21000);assert.equal(matchEvidence(payment!,rows).candidateRows[0].paid,true);
 const partial=extractReconciliationEvidence(mail('partial',['INBOX'],'Interac transfer received','Auto-deposited $100.00 CAD. Invoice 26116'),rows);
 assert.equal(matchEvidence(partial!,rows).match,'amount-mismatch');
});
test('amount alone does not choose between duplicate invoice totals',()=>{
 const payment=extractReconciliationEvidence(mail('ambiguous',['INBOX'],'Interac transfer received','Auto-deposited $367.50 CAD'),rows);
 assert.equal(payment?.kind,'payment');assert.equal(matchEvidence(payment!,rows).match,'ambiguous');assert.equal(matchEvidence(payment!,rows).candidateRows.length,2);
 const usd=extractReconciliationEvidence(mail('usd',['INBOX'],'Stripe payment received','US$367.50 paid'),rows);
 assert.equal(usd?.currency,'USD');assert.equal(matchEvidence(usd!,rows).match,'unmatched');
 assert.equal(extractReconciliationEvidence(mail('promise',['INBOX'],'Interac transfer sent','I sent $367.50 today'),rows),null);
});
test('review decisions are Hub-only and duplicate evidence stays resolved',()=>{
 const store=new Store(':memory:');const evidence=extractReconciliationEvidence(mail('review',['INBOX'],'Interac transfer received','Auto-deposited $210.00 CAD. Invoice 26117'),rows)!;
 const now=new Date().toISOString();const suggestion:ReconciliationSuggestion={...evidence,...matchEvidence(evidence,rows),id:'test-suggestion',source:'gmail',status:'open',resolution:'',createdAt:now,updatedAt:now};
 assert.equal(store.saveReconciliationSuggestion(suggestion),true);assert.equal(store.saveReconciliationSuggestion(suggestion),false);
 const confirmed=store.resolveReconciliationSuggestion('test-suggestion','confirmed','Verified manually');assert.equal(confirmed.status,'confirmed');
 assert.equal(store.saveReconciliationSuggestion({...suggestion,subject:'Changed'}),false);assert.equal(store.reconciliationSuggestions()[0].subject,suggestion.subject);
 assert.throws(()=>store.resolveReconciliationSuggestion('test-suggestion','dismissed',''),/already reviewed/);store.close();
});
