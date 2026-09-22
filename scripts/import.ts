import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parse} from 'csv-parse/sync';
import {Store} from '../server/store.ts';
import {readICS} from '../server/calendar.ts';
import {stableId} from '../server/parser.ts';
import {DateTime} from 'luxon';
import {config} from '../server/config.ts';
const store=new Store(config.database);
const calendarPath=process.env.CALENDAR_EXPORT||'/private/tmp/jfm-review-sep19/calendar0.ics';
const phase0=resolve(process.env.PHASE0_DIR||'../phase0');
const rows=(name:string)=>parse(readFileSync(resolve(phase0,'data',name),'utf8'),{columns:true,skip_empty_lines:true}) as Record<string,string>[];
try{
 const importedAt=new Date().toISOString(),snapshotAt='2026-09-19T18:27:00Z';
 const events=readICS(readFileSync(calendarPath,'utf8'));
 const result=store.apply('calendar-export',events,{full:true});
 store.setSync({id:'calendar-export',label:'Booking calendar export',mode:'export',lastAttempt:importedAt,lastSuccess:null,snapshotAt,error:null,count:result.count});
 if(!store.getSetting('active-calendar'))store.setSetting('active-calendar','calendar-export');
 store.setSync({id:'sheet-export',label:'Invoice register snapshot',mode:'export',lastAttempt:importedAt,lastSuccess:null,snapshotAt:'2026-09-19T23:30:00Z',error:null,count:210});
 const includedIds=new Set(store.jobs().map(j=>j.sourceId.split('|')[0]));
 for(const r of rows('calendar_candidates_2026.csv').filter(r=>r.calendar==='Jonathan'&&!includedIds.has(r.uid))){
  store.review({id:stableId('unparsed-calendar',r.uid),kind:'Check booking',title:r.title,detail:`${r.date_local}: the earlier audit flagged this title, but it does not identify a booking reliably. Confirm the client and services before adding a job.`,jobId:null,source:'September 19 calendar audit',status:'open',updatedAt:importedAt});
 }
 for(const r of rows('audit_recent_3_months.csv')){
  if(r.evidence_class!=='unresolved')continue;
  const job=store.jobs().find(j=>j.title.trim()===r.title.trim()&&DateTime.fromISO(j.start).setZone('America/Vancouver').toISODate()===r.shoot_date);
  store.review({id:stableId('audit',r.source_row),kind:'Possible missed invoice',title:r.client_candidate||r.title,detail:`${r.shoot_date}: no confirmed invoice match in the September 19 reference audit. ${Number(r.days_as_of_2026_09_19)>=21?'At least 21 days old at audit time.':'Recent at audit time; may not have been due.'} ${r.client_only_sheet_candidate_rows?'The Sheet has a possible client-only pending row. ':''}Confirm the completed job, property and invoice before billing.`,jobId:job?.id||null,source:'September 19 audit snapshot',status:'open',updatedAt:importedAt});
 }
 for(const r of rows('review_queue.csv').filter(r=>r.kind==='row_total_mismatch'))store.review({id:stableId('register',r.row),kind:'Register discrepancy',title:`Invoice ${r.invoice_ref} / row ${r.row}`,detail:r.detail,jobId:null,source:'2026 register snapshot',status:'open',updatedAt:importedAt});
 const notesPath=resolve(process.env.REGISTER_NOTES_FILE||resolve(config.database,'..','register-notes.json'));
 const notes:[string,string,string][]=existsSync(notesPath)?JSON.parse(readFileSync(notesPath,'utf8')):[];
 for(const [id,title,detail] of notes)store.review({id:stableId('register-note',id),kind:'Register discrepancy',title,detail,jobId:null,source:'2026 register snapshot',status:'open',updatedAt:importedAt});
 store.setSetting('snapshot-note','Reference data captured September 19, 2026. Calendar and register are not live.');
 store.audit('reference-import','phase0');console.log(JSON.stringify({jobs:result.count,changed:result.changed,reviewItems:store.reviews().length,mode:'export; no live writes'}));
}finally{store.close();}
