import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBooking} from '../server/parser.ts';
import {orderedItems,shortCalendarName} from '../src/review-display.ts';

test('review ordered items use short codes from parsed services',()=>{
 const job=parseBooking({id:'job-1',title:'PS PV DR FP Client Name',start:'2026-09-25T10:00:00-07:00',end:'2026-09-25T11:00:00-07:00',location:'Property'},'google-calendar')!;
 assert.deepEqual(orderedItems(job),{short:'PS · PV · DR · FP',full:'Premium photo, Video, Drone, Floor plan'});
 assert.equal(orderedItems(undefined).short,'—');
 assert.equal(orderedItems({...job,services:[]}).short,'Confirm items');
});

test('review calendar labels abbreviate known contractor and export sources',()=>{
 const connections=[{id:'google-calendar-allan',label:'Allans photoshoot calendar'},{id:'google-calendar-richard',label:"Richard's Photoshoot Calendar"},{id:'google-calendar-john',label:'John Nie booking calendar'},{id:'google-calendar-mia',label:"Mia's photoshoot calendar"}];
 assert.equal(shortCalendarName('google-calendar-allan',connections),'Allan');
 assert.equal(shortCalendarName('google-calendar-richard',connections),'Richard');
 assert.equal(shortCalendarName('google-calendar-john',connections),'John Nie');
 assert.equal(shortCalendarName('google-calendar-mia',connections),'Mia');
 assert.equal(shortCalendarName('calendar-export',connections),'Export');
 assert.equal(shortCalendarName('google-calendar-george',connections),'George');
});
