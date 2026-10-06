import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReviewSorter,ReviewNote} from '../src/WorkflowPanels.tsx';
import {redundantReviewDetail} from '../src/review-display.ts';

test('sort controls place the recoverable trash action at the top without redundant guidance',()=>{
 const html=renderToStaticMarkup(React.createElement(ReviewSorter,{busy:false,onSort:()=>{},onDelete:()=>{}}));
 assert.ok(html.indexOf('Sort this shoot')<html.indexOf('Move to Recently Deleted'));
 assert.ok(html.indexOf('Move to Recently Deleted')<html.indexOf('Real Estate</button>'));
 assert.ok(html.includes('Submit + Invoice'));
 assert.ok(!html.includes('Choose its type to move it toward invoice drafting.'));
 assert.ok(!html.includes('review-note'));
 assert.equal((html.match(/aria-label="Move to Recently Deleted"/g)||[]).length,1);
 const busy=renderToStaticMarkup(React.createElement(ReviewSorter,{busy:true,onSort:()=>{},onDelete:()=>{}}));
 assert.match(busy,/<button[^>]*disabled=""[^>]*aria-label="Move to Recently Deleted"/);
});

test('the optional note remains separately editable below the booking details',()=>{
 const html=renderToStaticMarkup(React.createElement(ReviewNote,{note:'Keep this context',onNote:()=>{}}));
 assert.ok(html.includes('Keep this context'));
 assert.ok(html.includes('for="review-note"'));
 assert.ok(!html.includes('Sort this shoot'));
});

test('duplicate pricing warnings are hidden, but unique cancellation and review details remain',()=>{
 const issues=['Confirm pricing profile and agreed quote'];
 assert.equal(redundantReviewDetail(issues[0],issues),true);
 assert.equal(redundantReviewDetail(issues[0]+'. ',issues),true);
 assert.equal(redundantReviewDetail('Google reports this booking cancelled.',issues),false);
 assert.equal(redundantReviewDetail('Check booking',[]),false);
});
