import type {Completion} from '../../server/completion';
import type {Job} from '../../server/types';
// Synthetic data only. Mirrors the April 25 split-invoice shape without customer data.
export const layoutJob={id:'layout-fixture',start:'2026-04-25T13:00:00-07:00',title:'PS TL DR Example split-invoice project'} as Job;
export function layoutCompletion(rowCount=4,emailCount=3):Completion{
 const row={row:84,number:'EXAMPLE-001',client:'Example split-invoice customer',date:'2026-05-11',totalCents:101063,paid:true,notes:'Two-property shoot',orders:'Photos, drone and video'};
 return {jobId:layoutJob.id,row,spreadsheetId:'fixture-only',gid:0,readAt:'2026-10-06T03:00:00Z',matchedAt:'2026-10-06T03:00:00Z',basis:'Invoice and delivery evidence match. All parts are paid. '+('Long evidence reference without spaces: '+ 'reference'.repeat(24)),evidence:{project:'Two properties with multiple split invoices and delivery threads',rows:Array.from({length:rowCount},(_,i)=>({...row,row:84+i,number:'EXAMPLE-'+i})),emails:Array.from({length:emailCount},(_,i)=>({threadId:'thread-'+i,messageId:'message-'+i,subject:'Example delivery thread '+i}))}};
}
