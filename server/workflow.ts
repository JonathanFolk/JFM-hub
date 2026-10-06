import {DateTime} from 'luxon';
import {commercialSubtypes,squareFootageBands,type Job,type SortDetails,type InvoiceLine,type ShootSort} from './types.ts';

export const plainNotes=(text:string)=>text.replace(/<br\s*\/?\s*>|<\/p>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').slice(0,16000);
const provisional='HOLD|ON HOLD|TENTATIVE|TENTITIVE|TENTATVE|WEATHER|WHEATHER|WEATER|TBR|TBD|TBC|PENDING|STANDBY|RESCHEDULE|RESCHEUDLE|RESCHDULE';
const afterServices=new RegExp(`^((?:(?:PS|PP|EP|BP|BPS|VI|PV|BV|DR|FP|PSVI|PSDR|PSDRVI)\\s+)+)(?:${provisional})\\b[\\s:–—/-]*`,'i');
export const provisionalPrefix=new RegExp(`^(?:${provisional})\\b[\\s:–—/-]*`,'i');
export function isUnconfirmed(title:string){return provisionalPrefix.test(title)||afterServices.test(title)||new RegExp(`(?:\\(|\\[|\\s[-–—]\\s)(?:${provisional})(?:\\b|$)`,'i').test(title)||new RegExp(`\\b(?:${provisional})\\s*$`,'i').test(title);}
export function stripProvisional(title:string){let result=title;for(let i=0;i<6;i++)result=result.replace(provisionalPrefix,'').replace(afterServices,'$1');return result.replace(new RegExp(`\\s*(?:\\(|\\[|[-–—])?\\s*(?:${provisional})[)\\]]?\\s*$`,'i'),'').trim();}
export function extractArea(text:string):{area?:number;areaIssue?:string}{
 text=plainNotes(text);const matches=[...text.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\s*(?:sq\.?\s*ft\.?|sqft|sf|square\s+feet)\b/gi)];
 if(matches.some(m=>/(?:[<>≤≥]|\d\s*[-–])\s*$/.test(text.slice(Math.max(0,m.index!-12),m.index))))return {areaIssue:'Area is a range or limit; confirm its pricing band.'};
 const values:number[]=[];
 for(const m of matches){const before=text.slice(Math.max(0,m.index!-30),m.index);const after=text.slice(m.index!+m[0].length,m.index!+m[0].length+25);if(/(?:lot|land|garage|balcony|patio)\s*(?:area|size)?\s*[:=]?\s*$/i.test(before)||/^\s*(?:lot|land|garage|balcony|patio)\b/i.test(after))continue;const n=Number(m[1].replaceAll(',',''))*(m[2]?1000:1);if(Number.isInteger(n)&&n>0&&n<=100000)values.push(n);}
 const unique=[...new Set(values)];if(unique.length>1)return {areaIssue:'Multiple square-footage values; confirm the property area.'};
 if(unique.length===1){if(/\b(?:approx(?:imately)?|about|estimate|roughly)\b/i.test(text))return {areaIssue:'Approximate square footage needs confirmation.'};return {area:unique[0]};}return {};
}
export function areaRange(area:number){if(area<1000)return 'Under 1,000 sq ft';if(area<2500)return 'Under 2,500 sq ft';if(area===2500)return 'Under 2,500 sq ft';return squareFootageBands.find(b=>b.min>=2501&&area>=b.min&&area<=b.max)?.label||'';}
export function explicitAddons(text:string):string[]{
 const result:string[]=[];
 for(const clause of plainNotes(text).split(/[\n.;]/)){
  if(/\b(?:no|not|without|optional|if needed|if required|maybe|quote only)\b/i.test(clause))continue;
  if(/\bessentials?\b.*\b(?:drone|aerial)\b|\b(?:drone|aerial)\b.*\bessentials?\b/i.test(clause))result.push('Essentials Aerial Drone (<6 Photos)');
  else if(/\bfull aerial drone\b/i.test(clause))result.push('Full Aerial Drone (<15 Photos)');
  else if(/\bdrone\b/i.test(clause))result.push('Drone');
  if(/\b(?:twilight|golden hour)\b/i.test(clause))result.push('Twilight');
  if(/\bvirtual staging\b/i.test(clause))result.push('Virtual Staging');
  if(/\b(?:image retouching|advanced photoshop)\b/i.test(clause))result.push('Image Retouching');
  if(/\b(?:rush|expedited)\b/i.test(clause))result.push('Rush Expedited Delivery');
 }
 return [...new Set(result)];
}
export function serviceQuantity(description:string,notes:string):number|undefined{
 const phrase=description==='Virtual Staging'?'virtual staging':description==='Image Retouching'?'(?:image retouching|advanced photoshop)':description==='Rush Expedited Delivery'?'(?:rush|expedited delivery)':null;if(!phrase)return undefined;
 const unit=description==='Rush Expedited Delivery'?'services?':'(?:images?|photos?)';
 const matches=[...plainNotes(notes).matchAll(new RegExp(`\\b${phrase}\\s*[:=—-]?\\s*(\\d+)\\s*${unit}\\b|\\b(\\d+)\\s*${unit}\\s*(?:of|for|with)?\\s*${phrase}\\b`,'gi'))];
 const values=[...new Set(matches.map(m=>Number(m[1]||m[2])))];return values.length===1&&values[0]>=1&&values[0]<=100?values[0]:undefined;
}
export function addressFromNotes(notes:string){
 const addresses=plainNotes(notes).split('\n').flatMap(line=>{const match=line.match(/^\s*(?:property\s+)?address\s*:\s*(.+)$/i);return match&&/\d/.test(match[1])&&match[1].includes(',')?[match[1].trim()]:[];});return [...new Set(addresses)].length===1?addresses[0]:'';
}
export function addressKey(location:string){return location.toLowerCase().replace(/\b[a-z]\d[a-z]\s*\d[a-z]\d\b/g,'').replace(/\b(?:british columbia|bc|canada)\b/g,'').replace(/\bstreet\b/g,'st').replace(/\bavenue\b/g,'ave').replace(/\broad\b/g,'rd').replace(/\bdrive\b/g,'dr').replace(/\b(?:suite|unit|apt)\b/g,'unit').replace(/[^a-z0-9]+/g,' ').trim();}
export function samePropertyDay(a:Job,b:Job){const key=addressKey(a.location);return !!key&&/\d/.test(key)&&key===addressKey(b.location)&&DateTime.fromISO(a.start).setZone('America/Vancouver').toISODate()===DateTime.fromISO(b.start).setZone('America/Vancouver').toISODate();}
export function normalizeSortDetails(raw:Record<string,unknown>):SortDetails{
 if(!commercialSubtypes.includes(raw.commercialSubtype as any))throw new Error('Choose a commercial category.');
 const subtype=raw.commercialSubtype as SortDetails['commercialSubtype'];
 if(subtype==='Developer Residential'&&!['staged','vacant'].includes(String(raw.commercialPackage)))throw new Error('Choose staged or vacant.');
 if(subtype?.startsWith('Interior Design')&&!['short','half'].includes(String(raw.commercialPackage)))throw new Error('Choose short visit or four hours.');
 if(subtype==='Commercial Exterior'&&(!Number.isInteger(raw.imageCount)||Number(raw.imageCount)<1||Number(raw.imageCount)>100||!Number.isInteger(raw.retouchCount??0)||Number(raw.retouchCount??0)<0||Number(raw.retouchCount??0)>Number(raw.imageCount)))throw new Error('Choose 1–100 images and no more retouched images than deliverables.');
 return {commercialSubtype:subtype,commercialPackage:raw.commercialPackage as SortDetails['commercialPackage'],imageCount:subtype==='Commercial Exterior'?Number(raw.imageCount):undefined,retouchCount:subtype==='Commercial Exterior'?Number(raw.retouchCount||0):undefined,twilight:raw.twilight===true,drone:raw.drone===true};
}
export function commercialLines(sort:ShootSort):InvoiceLine[]{
 const result:InvoiceLine[]=[];const add=(description:string,quantity=1)=>result.push({id:`commercial-${result.length+1}`,description,quantity,unitPriceCents:0});
 const subtype=sort.commercialSubtype;
 if(subtype==='Developer Residential')add(`Developer Residential — ${sort.commercialPackage}`);
 else if(subtype==='Commercial Exterior'){add('Commercial Exterior — on-site base');add('Commercial Exterior — edited deliverable',sort.imageCount||1);if(sort.twilight)add('Commercial Exterior — after-hours twilight');if(sort.drone)add('Commercial Exterior — drone launch');if(sort.retouchCount)add('Commercial Exterior — advanced Photoshop',sort.retouchCount);}
 else if(subtype?.startsWith('Interior Design'))add(`${subtype} — ${sort.commercialPackage==='half'?'4 hours':'short visit'}`);
 else add('Custom commercial quote');
 return result;
}
