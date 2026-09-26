import type {Store} from './store.ts';
import type {GmailMessage,GmailPart} from './gmail.ts';
import {gmailAccessToken} from './gmail.ts';
import {readInvoiceSheet} from './invoicing-sheet.ts';
import type {InvoiceSheetRow,ReconciliationSuggestion,SyncState} from './types.ts';
import {stableId} from './parser.ts';

type Evidence=Pick<ReconciliationSuggestion,'kind'|'sourceId'|'threadId'|'subject'|'from'|'date'|'excerpt'|'invoiceNumbers'|'amountCents'|'currency'>;
const syncId='invoice-reconciliation';
const running=new WeakSet<Store>();
const header=(message:GmailMessage,name:string)=>message.payload?.headers?.find(item=>item.name.toLowerCase()===name)?.value||'';
const decoded=(data:string)=>Buffer.from(data,'base64url').toString('utf8');
function bodyText(part:GmailPart|undefined):string{
 if(!part)return '';
 const body=part.body?.data?decoded(part.body.data):'';
 const own=part.mimeType==='text/plain'?body:part.mimeType==='text/html'?body.replace(/<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>'):'';
 return [own,part.filename||'',...(part.parts||[]).map(bodyText)].filter(Boolean).join(' ').slice(0,60_000);
}
function amountFrom(text:string):{amountCents:number|null;currency:'CAD'|'USD'|null}{
 const found=[...text.matchAll(/(?:\b(CAD|USD)\s*)?(US\$|CA\$|C\$|\$)\s*([\d,]{1,10}\.\d{2})\b(?:\s*(CAD|USD))?|\b(CAD|USD)\s+([\d,]{1,10}\.\d{2})\b/gi)].slice(0,12).map(match=>({cents:Math.round(Number((match[3]||match[6]).replaceAll(',',''))*100),currency:(match[1]||match[4]||match[5]||(match[2]?.toUpperCase()==='US$'?'USD':'CAD')).toUpperCase()})).filter(item=>Number.isSafeInteger(item.cents)&&item.cents>0&&item.cents<=100_000_000);
 const unique=[...new Map(found.map(item=>[`${item.currency}:${item.cents}`,item])).values()];
 return unique.length===1?{amountCents:unique[0].cents,currency:unique[0].currency==='USD'?'USD':'CAD'}:{amountCents:null,currency:null};
}
export function extractReconciliationEvidence(message:GmailMessage,rows:InvoiceSheetRow[]):Evidence|null{
 if(!message.id)return null;
 const subject=header(message,'subject').slice(0,200),from=header(message,'from').slice(0,200),to=header(message,'to').slice(0,200),date=header(message,'date').slice(0,100);
 const content=bodyText(message.payload)||message.snippet||'';
 const full=`${subject} ${to} ${content}`;
 const sent=message.labelIds?.includes('SENT')&&/\binvoice\b|\binv\s*#/i.test(subject+' '+content.slice(0,1500));
 const payment=!message.labelIds?.includes('SENT')&&/(interac|e[ -]?transfer|auto[ -]?deposit|stripe)/i.test(subject+' '+content.slice(0,2500))&&/(received|deposited|accepted|completed|succeeded|paid)/i.test(subject+' '+content.slice(0,2500));
 if(!sent&&!payment)return null;
 const invoiceNumbers=[...new Set(rows.filter(row=>row.number.length>=5&&new RegExp(`(^|[^A-Za-z0-9])${row.number.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^A-Za-z0-9])`,'i').test(full)).map(row=>row.number))].slice(0,20);
 const amount=amountFrom(full);
 return {kind:sent?'sent':'payment',sourceId:message.id,threadId:message.threadId||message.id,subject,from,date,excerpt:(message.snippet||content).replace(/\s+/g,' ').slice(0,280),invoiceNumbers,...amount};
}
const normalized=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function matchEvidence(evidence:Evidence,rows:InvoiceSheetRow[]):Pick<ReconciliationSuggestion,'candidateRows'|'match'>{
 const invoiceCandidates=rows.filter(row=>evidence.invoiceNumbers.some(number=>number.toLowerCase()===row.number.toLowerCase()));
 if(invoiceCandidates.length){if(invoiceCandidates.length!==1)return {candidateRows:invoiceCandidates.slice(0,20),match:'ambiguous'};const row=invoiceCandidates[0];return {candidateRows:[row],match:evidence.currency==='CAD'&&evidence.amountCents!==null&&row.totalCents!==null&&evidence.amountCents!==row.totalCents?'amount-mismatch':'invoice-number'};}
 if(evidence.kind==='payment'&&evidence.amountCents!==null&&evidence.currency==='CAD'){
  const amountCandidates=rows.filter(row=>row.totalCents===evidence.amountCents);
  if(amountCandidates.length===1){const client=normalized(amountCandidates[0].client);const text=normalized(`${evidence.subject} ${evidence.from} ${evidence.excerpt}`);return {candidateRows:amountCandidates,match:client.length>=5&&text.includes(client)?'amount-and-client':'amount-only'};}
  if(amountCandidates.length>1)return {candidateRows:amountCandidates.slice(0,20),match:'ambiguous'};
 }
 return {candidateRows:[],match:'unmatched'};
}
function suggestion(evidence:Evidence,rows:InvoiceSheetRow[]):ReconciliationSuggestion{
 const now=new Date().toISOString();return {...evidence,...matchEvidence(evidence,rows),id:stableId('reconciliation',evidence.sourceId+'-'+evidence.kind),source:'gmail',status:'open',resolution:'',createdAt:now,updatedAt:now};
}
async function gmailGet(token:string,path:string):Promise<any>{
 const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
 if(!response.ok){const error=new Error(response.status===401?'Gmail authorization expired. Reconnect in Connections.':`Gmail sync failed (${response.status}).`);Object.assign(error,{status:response.status});throw error;}
 return response.json();
}
async function changedMessageIds(token:string,cursor:string|undefined):Promise<{ids:string[];historyId:string;initial:boolean}>{
 const ids=new Set<string>();
 if(cursor){
  let page:string|undefined,historyId=cursor;
  do{const query=new URLSearchParams({startHistoryId:cursor,maxResults:'500',historyTypes:'messageAdded'});if(page)query.set('pageToken',page);
   let result:{history?:{messagesAdded?:{message?:{id?:string}}[]}[];nextPageToken?:string;historyId?:string};
   try{result=await gmailGet(token,`history?${query}`);}catch(error){if((error as Error&{status?:number}).status===404)throw new Error('Gmail change history expired. Use Rescan last 30 days in Connections, then audit any older gap manually.');throw error;}
   for(const record of result.history||[])for(const added of record.messagesAdded||[])if(added.message?.id)ids.add(added.message.id);
   historyId=result.historyId||historyId;page=result.nextPageToken;if(ids.size>2000)throw new Error('Too many Gmail changes for one sync. No cursor was advanced.');
  }while(page);
  return {ids:[...ids],historyId,initial:false};
 }
 const profile=await gmailGet(token,'profile') as {historyId?:string};if(!profile.historyId)throw new Error('Gmail did not return a mailbox cursor.');
 let page:string|undefined;
 do{const query=new URLSearchParams({q:'newer_than:30d {invoice interac "e-transfer" autodeposit "auto-deposit" stripe deposit}',maxResults:'500'});if(page)query.set('pageToken',page);
  const result=await gmailGet(token,`messages?${query}`) as {messages?:{id:string}[];nextPageToken?:string};
  for(const message of result.messages||[])ids.add(message.id);page=result.nextPageToken;
  if(ids.size>2000)throw new Error('More than 2,000 messages in the initial 30-day scan. Narrow the backfill before continuing.');
 }while(page);
 return {ids:[...ids],historyId:profile.historyId,initial:true};
}
export async function syncInvoiceEvidence(store:Store,rescan=false):Promise<{scanned:number;created:number;open:number;initial:boolean}>{
 if(running.has(store))throw new Error('An invoice evidence sync is already running.');
 if(!store.getSetting('gmail-refresh')||!store.getSetting('sheets-refresh'))throw new Error('Connect Gmail and the master spreadsheet in Connections first.');
 running.add(store);const old=store.sync(syncId),attempt=new Date().toISOString();const state:SyncState={id:syncId,label:'Invoice evidence (Gmail + 2026 Sheet)',mode:'live',lastAttempt:attempt,lastSuccess:old?.lastSuccess||null,snapshotAt:null,error:null,count:old?.count||0};store.setSync(state);
 try{
  const [rows,token]=await Promise.all([readInvoiceSheet(store),gmailAccessToken(store)]);
  for(const oldSuggestion of store.reconciliationSuggestions().filter(item=>item.status==='open'))store.saveReconciliationSuggestion({...oldSuggestion,...matchEvidence(oldSuggestion,rows),updatedAt:new Date().toISOString()});
  const changed=await changedMessageIds(token,rescan?undefined:store.getSetting('reconciliation-history-id'));let created=0;
  for(let index=0;index<changed.ids.length;index+=10){const messages=await Promise.all(changed.ids.slice(index,index+10).map(async id=>{try{return await gmailGet(token,`messages/${encodeURIComponent(id)}?format=full`) as GmailMessage;}catch(error){if((error as Error&{status?:number}).status===404)return null;throw error;}}));
   for(const message of messages){if(!message)continue;const evidence=extractReconciliationEvidence(message,rows);if(evidence&&store.saveReconciliationSuggestion(suggestion(evidence,rows)))created++;}
  }
  store.setSetting('reconciliation-history-id',changed.historyId);
  const open=store.reconciliationSuggestions().filter(item=>item.status==='open').length;
  store.setSync({...state,lastSuccess:new Date().toISOString(),count:open});store.audit('reconciliation-sync-success',syncId);
  return {scanned:changed.ids.length,created,open,initial:changed.initial};
 }catch(error){store.setSync({...state,error:error instanceof Error?error.message:'Invoice evidence sync failed.'});throw error;}finally{running.delete(store);}
}
