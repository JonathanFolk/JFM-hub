import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReviewSorter,ReviewNote,BookingAddress} from '../src/WorkflowPanels.tsx';
import {redundantReviewDetail} from '../src/review-display.ts';

test('booking subtitle shows street and city without province, postal code or country',()=>{
 const html=renderToStaticMarkup(React.createElement(BookingAddress,{location:'4508 Prince Albert St VANCOUVER, BC V5V4k2'}));
 assert.equal(html,'<p class="caption booking-address">4508 Prince Albert St VANCOUVER</p>');
 const unit=renderToStaticMarkup(React.createElement(BookingAddress,{location:'Unit 3, 123 Test St, Vancouver, British Columbia V6B 1A1, Canada'}));
 assert.equal(unit,'<p class="caption booking-address">Unit 3, 123 Test St, Vancouver</p>');
});

test('a missing booking address is clearly marked instead of invented',()=>{
 const html=renderToStaticMarkup(React.createElement(BookingAddress,{location:''}));
 assert.ok(html.includes('Address needs confirmation'));
});

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
