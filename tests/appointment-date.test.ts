import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AppointmentDate,appointmentDate} from '../src/AppointmentDate.tsx';

test('date stamp follows month, day, weekday and exposes a full date including year',()=>{
 const date=appointmentDate('2024-10-28T12:00:00-07:00')!;
 assert.deepEqual([date.month,date.day,date.weekday],['OCT','28','MON']);
 const html=renderToStaticMarkup(React.createElement(AppointmentDate,{start:'2024-10-28T12:00:00-07:00'}));
 assert.ok(html.indexOf('>OCT<')<html.indexOf('>28<'));
 assert.ok(html.indexOf('>28<')<html.indexOf('>MON<'));
 assert.match(html,/aria-label="Appointment: [^"]*2024/);
 assert.match(html,/datetime="2024-10-28T12:00:00-07:00"/i);
});
test('stamps use Vancouver appointment dates, including UTC rollover and DST',()=>{
 assert.equal(appointmentDate('2026-10-29T01:00:00Z')?.day,'28');
 assert.equal(appointmentDate('2026-01-01T07:30:00Z')?.label.includes('2025'),true);
 assert.equal(appointmentDate('2026-03-08T09:30:00Z')?.day,'8');
 assert.equal(appointmentDate('2026-03-08T10:30:00Z')?.day,'8');
 assert.equal(appointmentDate('2026-10-28')?.weekday,'WED');
});
test('missing or invalid dates render an explicit placeholder without inventing an appointment',()=>{
 for(const start of [undefined,'','invalid','2026-02-30']){
  assert.equal(appointmentDate(start),null);
  const html=renderToStaticMarkup(React.createElement(AppointmentDate,{start}));
  assert.ok(html.includes('Appointment date needs confirmation'));
  assert.ok(!html.includes('<time'));
 }
});
