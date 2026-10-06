import React from 'react';
import type {Completion} from '../server/completion';
import type {Job} from '../server/types';
import {AppointmentDate} from './AppointmentDate';
import {StatusRibbon} from './WorkflowControls';

// Evidence is intentionally below the content, never an intrinsic-width side column.
// A split invoice can add arbitrarily many links without shrinking the booking name.
export function CompletedBooking({completion:c,job,busy,onView,onReopen}:{
 completion:Completion;job?:Job;busy:boolean;onView:()=>void;onReopen:()=>void;
}){
 const rows=c.evidence?.rows||[c.row];
 const emails=[...new Map(c.evidence?.emails.map(e=>[e.threadId,e])||[]).values()];
 const checked=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Vancouver',day:'numeric',month:'short',year:'numeric'}).format(new Date(c.readAt));
 const money=(cents:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100);
 return <article className="connection completed-dated-row">
  <AppointmentDate start={job?.start}/>
  <div className="completed-content">
   <StatusRibbon label={c.row.paid?'Complete · Paid':'Complete · Payment outstanding'} tone={c.row.paid?'done':'unconfirmed'}/>
   <h2>{c.row.client}</h2>
   <p>{c.evidence?.project||c.row.notes}</p>
   <small>{job?.title}</small>
   {rows.map(r=><p className="caption" key={r.row}>Invoice {r.number} · {money(r.totalCents)} · {r.date}</p>)}
   <p className="caption">Sheet checked {checked}. {c.basis}</p>
  </div>
  <div className="completed-footer">
   <nav className="completed-evidence" aria-label={`Evidence for ${c.row.client}`}>
    {rows.map(r=><a key={r.row} href={`https://docs.google.com/spreadsheets/d/${c.spreadsheetId}/edit#gid=${c.gid}&range=C${r.row}:K${r.row}`} target="_blank" rel="noopener noreferrer">Sheet row {r.row} ↗</a>)}
    {emails.map((e,i)=><a key={e.threadId} href={`https://mail.google.com/mail/u/?authuser=info%40jonathanfolk.ca#all/${e.messageId}`} target="_blank" rel="noopener noreferrer" title={e.subject}>Email evidence {i+1} ↗</a>)}
   </nav>
   <div className="actions">
    <button className="secondary" disabled={!job} onClick={onView}>View job</button>
    <button className="secondary" disabled={busy} onClick={onReopen}>Reopen job</button>
   </div>
  </div>
 </article>;
}
