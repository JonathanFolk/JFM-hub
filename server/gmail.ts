import {unseal} from './auth.ts';
import {config} from './config.ts';
import type {Store} from './store.ts';
import type {EmailPriceSuggestion} from './types.ts';

type GmailPart={mimeType?:string;body?:{data?:string};parts?:GmailPart[]};
type GmailMessage={id?:string;threadId?:string;snippet?:string;payload?:GmailPart&{headers?:{name:string;value:string}[]}};

function plainText(part:GmailPart|undefined):string{
 if(!part)return '';
 const own=part.mimeType==='text/plain'&&part.body?.data?Buffer.from(part.body.data,'base64url').toString('utf8'):'';
 return [own,...(part.parts||[]).map(plainText)].filter(Boolean).join('\n').slice(0,100_000);
}

export function extractEmailPrices(message:GmailMessage):EmailPriceSuggestion[]{
 const headers=message.payload?.headers||[];
 const header=(name:string)=>headers.find(item=>item.name.toLowerCase()===name)?.value||'';
 const content=plainText(message.payload)||message.snippet||'';
 const matches=[...content.matchAll(/\b(CAD|USD)\s*\$?\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)\b|\b(CA\$|US\$|C\$)\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)\b|\$\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)\s*\b(CAD|USD)\b/gi)];
 return matches.slice(0,5).flatMap(match=>{
  const currency=(match[1]||match[3]||match[6]||'').toUpperCase();
  const amount=Number((match[2]||match[4]||match[5]||'').replaceAll(',',''));
  const amountCents=Math.round(amount*100);
  const excerpt=content.slice(Math.max(0,(match.index||0)-80),Math.min(content.length,(match.index||0)+match[0].length+80)).replace(/\s+/g,' ').trim();
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>100_000_000||!/(quote|quoting|estimate|pricing|price|rate|fee|total|cost)/i.test(excerpt+' '+header('subject')))return [];
  return [{messageId:message.id||'',threadId:message.threadId||'',subject:header('subject').slice(0,200),from:header('from').slice(0,200),date:header('date').slice(0,100),amountCents,currency:currency==='USD'||currency==='US$'?'USD' as const:'CAD' as const,excerpt}];
 });
}

async function gmailAccessToken(store:Store){
 const secret=store.getSetting('gmail-refresh');if(!secret)throw new Error('Connect Gmail in Connections before searching for a commercial quote.');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:unseal(secret),grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Gmail authorization expired. Reconnect in Connections.');
 const body=await response.json() as {access_token?:string};if(!body.access_token)throw new Error('Gmail authorization failed.');return body.access_token;
}

export async function commercialEmailPrices(store:Store,client:string):Promise<EmailPriceSuggestion[]>{
 const token=await gmailAccessToken(store);
 const query=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
 const term=client.replace(/["{}()\r\n]/g,' ').trim().slice(0,100);
 if(term.length<3)throw new Error('Add a client name before searching Gmail.');
 query.searchParams.set('q',`"${term}" {quote estimate pricing rate}`);query.searchParams.set('maxResults','10');
 const headers={Authorization:`Bearer ${token}`};
 const list=await fetch(query,{headers,signal:AbortSignal.timeout(15000)});
 if(!list.ok)throw new Error('Gmail search failed. Check the Gmail connection.');
 const ids=(await list.json() as {messages?:{id:string}[]}).messages||[];
 const messages=await Promise.all(ids.slice(0,10).map(async item=>{
  const result=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,{headers,signal:AbortSignal.timeout(15000)});
  return result.ok?await result.json() as GmailMessage:null;
 }));
 return messages.flatMap(message=>message?extractEmailPrices(message):[]).slice(0,20);
}
