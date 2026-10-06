import React from 'react';
import {DateTime} from 'luxon';

export function appointmentDate(value?:string){
 const date=value?DateTime.fromISO(value,{zone:'America/Vancouver'}).setZone('America/Vancouver').setLocale('en-CA'):null;
 if(!date?.isValid)return null;
 return {month:date.toFormat('MMM').toUpperCase(),day:date.toFormat('d'),weekday:date.toFormat('ccc').toUpperCase(),label:date.toLocaleString(DateTime.DATE_HUGE)};
}

export function AppointmentDate({start}:{start?:string}){
 const date=appointmentDate(start);
 if(!date)return <span className="appointment-date appointment-date-missing" aria-label="Appointment date needs confirmation" title="Appointment date needs confirmation"><span aria-hidden="true" className="appointment-month">DATE</span><span aria-hidden="true" className="appointment-day">—</span><span aria-hidden="true" className="appointment-weekday">TBC</span></span>;
 return <time className="appointment-date" dateTime={start} aria-label={`Appointment: ${date.label}`} title={date.label}><span aria-hidden="true" className="appointment-month">{date.month}</span><span aria-hidden="true" className="appointment-day">{date.day}</span><span aria-hidden="true" className="appointment-weekday">{date.weekday}</span></time>;
}
