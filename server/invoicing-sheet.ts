import {sheetsAccessToken} from './auth.ts';
import {config} from './config.ts';
import type {Store} from './store.ts';
import type {InvoiceSheetRow} from './types.ts';

export function sheetReadError(status:number,body:unknown){
 const error=(body as any)?.error;const reasons=[error?.status,...(Array.isArray(error?.errors)?error.errors.map((e:any)=>e.reason):[]),...(Array.isArray(error?.details)?error.details.map((e:any)=>e.reason):[])].filter(x=>typeof x==='string').join(' ');
 if(/SERVICE_DISABLED|accessNotConfigured/i.test(reasons))return 'Google Sheets API is disabled in the Hub OAuth project. Enable the Sheets API in that project, then retry.';
 if(/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(reasons))return 'The master Sheet connection is missing read-only Sheets permission. Reconnect master Sheet as the business account.';
 if(status===401)return 'Spreadsheet authorization expired. Reconnect master Sheet in Connections.';
 if(status===429||status>=500)return 'Google Sheets is temporarily unavailable or rate limited. Try again; the previous successful sync was preserved.';
 if(status===404)return 'Master Sheet not found or not visible to this account. Check the configured spreadsheet ID and account access.';
 if(status===403)return 'Google denied the master Sheet read (403). Check the Hub OAuth project API, Workspace app policy, read-only scope and file access. This does not necessarily mean sharing is wrong.';
 return 'Could not read the 2026 master Sheet. Check the configured file and 2026 tab/range.';
}

export function parseInvoiceSheet(values:unknown[][]):InvoiceSheetRow[]{
 const header=values[0]||[];
 if(String(header[0]||'').trim()!=='Inv #'||String(header[1]||'').trim()!=='Client'||String(header[4]||'').trim()!=='Total'||String(header[5]||'').trim()!=='Paid')throw new Error('The 2026 master Sheet columns changed. Reconciliation stopped without making suggestions.');
 return values.slice(2).flatMap((cells,index)=>{
  const number=String(cells[0]??'').trim(),client=String(cells[1]??'').trim();
  if(!number||!client)return [];
  const rawTotal=cells[4];const amount=rawTotal===null||rawTotal===undefined||rawTotal===''?Number.NaN:typeof rawTotal==='number'?rawTotal:Number(String(rawTotal).replace(/[$,]/g,''));
  const totalCents=Number.isFinite(amount)&&amount>=0&&amount<=1_000_000?Math.round(amount*100):null;
  return [{row:index+7,number,client,totalCents,paid:cells[5]===true||String(cells[5]).toUpperCase()==='TRUE',notes:String(cells[6]??'').slice(0,200)}];
 });
}

export async function readInvoiceSheet(store:Store):Promise<InvoiceSheetRow[]>{
 const token=await sheetsAccessToken(store);
 const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.invoicingSpreadsheetId)}/values/${encodeURIComponent("'2026'!D5:J")}`);
 url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
 const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(sheetReadError(response.status,await response.json().catch(()=>null)));
 const body=await response.json() as {values?:unknown[][]};return parseInvoiceSheet(body.values||[]);
}
