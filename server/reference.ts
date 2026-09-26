import type {AutomaticPricing,InvoiceReference,ReferenceCustomer,ReferenceInvoice,ShootCategory} from './types.ts';
import type {Store} from './store.ts';

export const clientNameKey=(value:string)=>value.normalize('NFKD').toLocaleLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const key=clientNameKey;
const number=(value:string)=>Number(value)||0;

function identityRows(store:Store,client:string){const normalized=key(client);return {normalized,customers:store.referenceRows('customers_master').filter(row=>key(row.display_name||'')===normalized),legacyList:store.referenceRows('legacy_list_match').filter(row=>key(row.list_name||'')===normalized)};}

export function clientOverrideKey(store:Store,client:string){
 const {normalized,customers,legacyList}=identityRows(store,client);
 return normalized.length>=2&&customers.length<=1&&legacyList.length<=1?`name:${normalized}`:null;
}

export function automaticPricing(store:Store,client:string,shootDate:string,category:ShootCategory|undefined):AutomaticPricing{
 const {normalized,customers,legacyList}=identityRows(store,client);
 const overrideKey=clientOverrideKey(store,client),clientOverride=overrideKey?store.getClientPricingOverride(overrideKey):null;
 const base={clientOverride,canSetClientOverride:!!overrideKey};
 if(!normalized||customers.length>1||legacyList.length>1)return {...base,profile:'review',reason:'Customer identity is missing or ambiguous; choose the pricing profile on this invoice.'};
 if(clientOverride)return {...base,profile:clientOverride,reason:`Client-level ${clientOverride} override saved in the Hub.`};
 if(shootDate>='2026-01-01'&&shootDate<'2026-04-01')return {...base,profile:'legacy',reason:'2026 Q1 used the Legacy sheets for every client.'};
 const customer=customers[0],listEntry=legacyList[0],status=customer?.legacy_status||'';
 if(status.startsWith('REVIEW')||status.startsWith('LIKELY')||listEntry?.status==='Matched - invoiced after Apr 1 but no (Legacy) lines')return {...base,profile:'review',reason:'Imported customer or invoice evidence conflicts; confirm the profile.'};
 if(status.startsWith('YES - on list')||listEntry)return {...base,profile:'legacy',reason:'Unique name on the imported Legacy-client list.'};
 if(status==='NO')return {...base,profile:'standard',reason:'Unique customer record marked non-Legacy.'};
 if(category==='Real Estate')return {...base,profile:'standard',reason:'General real-estate client with no Legacy-list match.'};
 return {...base,profile:'review',reason:'No confirmed pricing profile for this client and shoot type.'};
}

export function referenceForClient(store:Store,client:string,shootDate='',category?:ShootCategory):InvoiceReference{
 const automatic=automaticPricing(store,client,shootDate,category);
 if(!store.referenceImports().some(item=>item.dataset==='customers_master'))return {customer:null,historicalInvoices:[],warning:'No customer-history archive is imported into this Hub database.',automatic};
 const normalized=key(client);
 if(!normalized)return {customer:null,historicalInvoices:[],warning:'Add a billing client to look up historical records.',automatic};
 const matches=store.referenceRows('customers_master').filter(row=>key(row.display_name||'')===normalized);
 if(matches.length!==1)return {customer:null,historicalInvoices:[],warning:matches.length?'Several customer records match this name. Confirm the client manually.':automatic.profile==='legacy'?'No customer-master record matches this name, but the imported Legacy list does. Confirm the billing identity.':'No exact customer record matches this name. General real-estate clients default to Standard unless you override them.',automatic};
 const row=matches[0],legacyStatus=row.legacy_status||'';
 const profileHint:ReferenceCustomer['profileHint']=legacyStatus.startsWith('YES - on list')?'legacy':legacyStatus==='NO'?'standard':'review';
 const customer:ReferenceCustomer={customerId:row.customer_id,displayName:row.display_name,legacyStatus,billingRoute:row.billing_route||'',pdfInvoices2026:number(row.pdf_invoices_2026||''),match:'exact',profileHint};
 const names=new Set([row.display_name,...(row.pdf_client_names||'').split(';')].map(key).filter(Boolean));
 const historicalInvoices:ReferenceInvoice[]=store.referenceRows('invoices_2026_extracted').filter(item=>[item.billto_name,item.billto_company,item.client_in_filename].some(value=>names.has(key(value||'')))).map(item=>({file:item.file,number:item.jfm_no_printed||item.jfm_no_filename,issued:item.date_issued,due:item.due_date,balance:item.balance_due_printed,services:item.services,reconciles:item.totals_reconcile==='True'}));
 const warning=automatic.profile==='review'?'The imported Legacy status is uncertain. Choose an invoice profile or save a client override.':'Automatic pricing is based on the imported client name. Check the billing identity before issuing an invoice.';
 return {customer,historicalInvoices,warning,automatic};
}

export function pricingQuestions(store:Store){
 return store.referenceRows('pricing_2026Q2').filter(row=>row.confirm?.startsWith('yes')&&!(row.table==='rate_sheet'&&row.item==='Editorial photo'&&row.condition==='7001+ sqft')).map(row=>({table:row.table,section:row.section,item:row.item,condition:row.condition,priceCad:row.price_cad,source:row.source,note:row.notes,question:row.confirm}));
}
