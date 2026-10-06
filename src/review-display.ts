import type {Job,SyncState} from '../server/types';

export function streetCity(location:string){
 const parts=location.replace(/\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/gi,'').split(',').map(p=>p.trim()).filter(Boolean);
 const cleaned=parts.map(p=>p.replace(/\b(?:British Columbia|BC|Canada|United States|USA)\b/gi,'').trim()).filter(Boolean);
 return cleaned.join(', ')||'Address needs confirmation';
}
export function bookingStatus(status:Job['status']){return ['Held','To reschedule','Unconfirmed'].includes(status)?'Unconfirmed':status==='Booked'?'Confirmed':status;}

export function redundantReviewDetail(detail:string,issues:string[]){
 const normalize=(text:string)=>text.trim().replace(/[.\s]+$/,'');
 return [issues.join('. '),...issues].some(issue=>normalize(issue)===normalize(detail));
}

const serviceCodes:Record<string,string>={
 'Premium photo':'PS','Basic photo':'EP','Video':'PV','Basic video':'EV',
 'Drone':'DR','Floor plan':'FP','3D floor plan':'3DFP','Twilight':'TL'
};

export function orderedItems(job:Job|undefined){
 if(!job)return {short:'—',full:'No linked booking'};
 if(!job.services.length)return {short:'Confirm items',full:'Ordered items need confirmation'};
 return {short:job.services.map(service=>serviceCodes[service]||service).join(' · '),full:job.services.join(', ')};
}

export function shortCalendarName(source:string,connections:Pick<SyncState,'id'|'label'>[]){
 if(source==='calendar-export')return 'Export';
 const label=connections.find(connection=>connection.id===source)?.label?.trim()||'';
 if(!label)return source==='google-calendar'?'Jonathan':source.startsWith('google-calendar-')?source.slice('google-calendar-'.length).replace(/\b\w/g,letter=>letter.toUpperCase()):source||'Unknown';
 const known:[RegExp,string][]=[[/\b3d\s+elevate\b/i,'3D Elevate'],[/\bjohn\s+nie\b/i,'John Nie'],[/\bjonathan\b/i,'Jonathan'],[/\bgeorge\b/i,'George'],[/\brichard\b/i,'Richard'],[/\ballan(?:'?s)?\b/i,'Allan'],[/\bwilson\b/i,'Wilson']];
 const match=known.find(([pattern])=>pattern.test(label));if(match)return match[1];
 return label.replace(/\b(?:photoshoots?|calendar|bookings?|shoots?)\b/gi,'').replace(/[’']s\b/gi,'').replace(/\s+/g,' ').trim()||label;
}
