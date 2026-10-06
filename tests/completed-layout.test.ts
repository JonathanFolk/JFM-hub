import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CompletedBooking} from '../src/CompletedBooking.tsx';
import {appointmentDate} from '../src/AppointmentDate.tsx';
import {layoutCompletion,layoutJob} from './fixtures/completed-layout.ts';

test('split invoice evidence is below the booking, with no competing side column',()=>{
 const html=renderToStaticMarkup(React.createElement(CompletedBooking,{completion:layoutCompletion(4,3),job:layoutJob,busy:false,onView:()=>{},onReopen:()=>{}}));
 assert.equal((html.match(/Sheet row /g)||[]).length,4);
 assert.equal((html.match(/Email evidence /g)||[]).length,3);
 assert.ok(html.indexOf('completed-content')<html.indexOf('completed-footer'));
 assert.ok(html.indexOf('</h2>')<html.indexOf('completed-evidence'));
 assert.ok(html.includes('View job'));
 assert.ok(html.includes('Reopen job'));
 const css=readFileSync('src/appointment-date.css','utf8');
 assert.match(css,/\.completed-dated-row\{grid-template-columns:64px minmax\(0,1fr\);/);
 assert.match(css,/\.completed-footer\{grid-column:2;min-width:0;/);
 assert.match(css,/\.completed-evidence\{display:flex;flex-wrap:wrap;/);
});
test('many links remain available and duplicate email threads are consolidated',()=>{
 const c=layoutCompletion(20,20);c.evidence!.emails.push(c.evidence!.emails[0]);
 const html=renderToStaticMarkup(React.createElement(CompletedBooking,{completion:c,busy:true,onView:()=>{},onReopen:()=>{}}));
 assert.equal((html.match(/Email evidence /g)||[]).length,20);
 assert.equal((html.match(/Sheet row /g)||[]).length,20);
 assert.equal((html.match(/disabled=""/g)||[]).length,2);
 assert.equal(appointmentDate(layoutJob.start)?.weekday,'SAT');
 assert.equal(appointmentDate(layoutJob.start)?.day,'25');
});
test('tablet Jobs headings retain Services and hide the matching due column',()=>{
 const css=readFileSync('src/layout-safety.css','utf8');
 assert.match(css,/\.job-table \.table-head,\.job-table \.job-row\{grid-template-columns:100px 80px minmax\(0,2fr\) minmax\(0,1fr\)\}/);
 assert.match(css,/\.job-table \.table-head>span:nth-child\(4\)\{display:block\}/);
 assert.match(css,/\.job-table \.table-head>span:nth-child\(5\),\.job-table \.job-due\{display:none\}/);
});
