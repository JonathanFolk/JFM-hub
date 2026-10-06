import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {CompletedBooking} from '../src/CompletedBooking';
import {layoutCompletion,layoutJob} from '../tests/fixtures/completed-layout';

// Browser-rendered regression page: no credentials, database or live mutations.
const widths=[320,390,767,768,1024,1199,1440,1920];
const css=['style','workflow','modal','appointment-date','layout-safety'].map(n=>readFileSync(`src/${n}.css`,'utf8')).join('\n');
const rows=renderToStaticMarkup(<div className="workspace"><main>
 <h1>Layout regression fixtures</h1>
 {[ [1,0],[4,3],[20,20] ].map(([r,e])=><CompletedBooking key={r} completion={layoutCompletion(r,e)} job={layoutJob} busy={false} onView={()=>{}} onReopen={()=>{}}/>)}
 <div className="rate-row"><span><strong>Long service name {'Service'.repeat(30)}</strong><small>Long pricing guidance and notes</small></span><label className="rate-variant-select">Available prices<select defaultValue="1"><option value="1">Standard · A very long price variant label with a large size range · $1,250</option></select></label></div>
 <div className="connection"><div><h2>Calendar connection</h2><p>{'LongErrorReference'.repeat(30)}</p></div><dl><div><dt>Last sync</dt><dd>Three days ago</dd></div></dl><span className="status">Needs attention</span></div>
 <div className="job-table"><div className="table-head"><span>Label</span><span>Shoot</span><span>Client &amp; property</span><span>Services</span><span>Suggested due</span></div><button className="job-row"><span className="job-state">Confirmed</span><span className="job-date">Apr 25</span><span className="job-client"><strong>Example customer</strong></span><span className="job-services">Photo, video and drone</span><span className="job-due">Confirm</span></button></div>
 </main></div>);
const probe=`window.addEventListener('load',async()=>{await document.fonts.ready;const failures=[];const width=window.innerWidth;
 if(document.documentElement.scrollWidth>document.documentElement.clientWidth+1)failures.push('page overflow');
 for(const row of document.querySelectorAll('.completed-dated-row')){const content=row.querySelector('.completed-content').getBoundingClientRect(),footer=row.querySelector('.completed-footer').getBoundingClientRect(),box=row.getBoundingClientRect();
  if(content.width<Math.min(160,width*.45))failures.push('crushed booking column');
  if(footer.top<content.bottom-1)failures.push('evidence overlaps booking');
  for(const child of row.querySelectorAll('a,button,h2')){const r=child.getBoundingClientRect();if(r.left<box.left-1||r.right>box.right+1)failures.push('control/content escapes row');}
 }
 for(const row of document.querySelectorAll('.rate-row,.connection'))if(row.scrollWidth>row.clientWidth+1)failures.push('row overflow');
 if(width>=768){const headings=[...document.querySelector('.table-head').children].filter(e=>getComputedStyle(e).display!=='none'),cells=[...document.querySelector('.job-row').children].filter(e=>getComputedStyle(e).display!=='none');if(headings.length!==cells.length||headings.some((h,i)=>Math.abs(h.getBoundingClientRect().left-cells[i].getBoundingClientRect().left)>2))failures.push('Jobs columns misaligned');if(!headings.some(h=>h.textContent==='Services'))failures.push('Services heading missing');}
 parent.postMessage({layoutCheck:true,width,failures},'http://127.0.0.1:4320');
});`;
const fixture='<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style>'+rows+'<script>'+probe+'</script>';
const page='<!doctype html><title>Hub layout regression checks</title><h1>Hub layout regression checks</h1><p>Synthetic fixtures: single invoice, four split invoices + three emails, forty links, long words, rate controls and connection errors. No live data.</p><ol id="results">'+widths.map(w=>'<li id="w'+w+'">'+w+'px — waiting</li>').join('')+'</ol><script>addEventListener("message",e=>{if(!e.data.layoutCheck||![...document.querySelectorAll(\"iframe\")].some(f=>f.contentWindow===e.source))return;const el=document.getElementById("w"+e.data.width);if(el){el.textContent=e.data.width+"px — "+(e.data.failures.length?"FAIL: "+e.data.failures.join(", "):"PASS");el.dataset.result=e.data.failures.length?"fail":"pass";}});</script>'+widths.map(w=>'<details open><summary>Inspect '+w+'px</summary><iframe title="'+w+' pixel layout fixture" width="'+w+'" height="900" style="border:0" src="/fixture"></iframe></details>').join('');
createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(req.url==='/fixture'?fixture:page);}).listen(4320,'127.0.0.1',()=>console.log('Layout checks: http://127.0.0.1:4320 — open in a browser; all eight widths must PASS.'));
