import {randomUUID} from 'node:crypto';
import {shootCategories,squareFootageBands,squareFootageRanges} from './types.ts';
import type {CustomPricePrompt,InvoiceDraft,Rate,RateGuidance,ShootCategory,ShootSort,PriceSuggestion,PricingProfile} from './types.ts';

export function normalizeRate(value:unknown,existing?:Rate):Rate{
 const raw=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const category=raw.category as ShootCategory;
 const service=typeof raw.service==='string'?raw.service.trim():'';
 const squareFootageRange=category==='Real Estate'&&typeof raw.squareFootageRange==='string'?raw.squareFootageRange:'';
 const band=squareFootageBands.find(item=>item.label===squareFootageRange);
 const currency=raw.currency;
 const profile=raw.profile as PricingProfile;
 const unitPriceCents=Number(raw.unitPriceCents);
 if(!['standard','legacy'].includes(profile)||!shootCategories.includes(category)||service.length<2||service.length>160||category==='Real Estate'&&squareFootageRange!==''&&!squareFootageRanges.includes(squareFootageRange)||category!=='Real Estate'&&squareFootageRange!==''||!['CAD','USD'].includes(String(currency))||!Number.isSafeInteger(unitPriceCents)||unitPriceCents<=0||unitPriceCents>100_000_000)throw new Error('Enter a profile, category, service, valid range, currency and positive rate.');
 return {id:existing?.id||randomUUID(),profile,category,service,squareFootageRange,minSqft:band?.min??null,maxSqft:band?.max??null,currency:currency as 'CAD'|'USD',unitPriceCents,unit:['job','image','service','deliverable'].includes(String(raw.unit))?raw.unit as Rate['unit']:existing?.unit||'job',source:existing?.source||'Manual entry',note:existing?.note||'',updatedAt:new Date().toISOString()};
}

export function invoiceBand(invoice:InvoiceDraft,sort:ShootSort){
 const exact=invoice.squareFeet.match(/^\s*([\d,]+)\s*(?:sq\s*ft|sqft|sf)?\s*$/i);const area=exact?Number(exact[1].replaceAll(',','')):NaN;
 return Number.isInteger(area)&&area>0?{min:area,max:area}:squareFootageBands.find(item=>item.label===sort.squareFootageRange);
}
export function rateSuggestions(invoice:InvoiceDraft,sort:ShootSort|undefined,rates:Rate[]):PriceSuggestion[]{
 if(!sort)return [];
 const band=invoiceBand(invoice,sort);
 return invoice.lines.flatMap(line=>{
  const profile=line.pricingProfileOverride||invoice.pricingProfile;if(profile==='review')return [];
  const matches=rates.filter(rate=>rate.profile===profile&&rate.category===sort.category&&rate.currency===invoice.currency&&rate.service.toLocaleLowerCase()===line.description.toLocaleLowerCase()&&(sort.category!=='Real Estate'||rate.minSqft===null&&rate.maxSqft===null||!!band&&(rate.minSqft===null||band.min>=rate.minSqft)&&(rate.maxSqft===null||band.max<=rate.maxSqft)));
  return matches.length===1?[{lineId:line.id,rateId:matches[0].id,amountCents:matches[0].unitPriceCents,currency:matches[0].currency,service:matches[0].service,profile}]:[];
 });
}
export function customPricePrompts(invoice:InvoiceDraft,sort:ShootSort|undefined,guidance:RateGuidance[]):CustomPricePrompt[]{
 if(!sort)return [];
 const band=invoiceBand(invoice,sort);
 if(!band)return [];
 return invoice.lines.flatMap(line=>guidance.filter(item=>item.profile===(line.pricingProfileOverride||invoice.pricingProfile)&&item.category===sort.category&&item.service.toLowerCase()===line.description.toLowerCase()&&item.currency===invoice.currency&&band.min>=item.minSqft&&(item.maxSqft===null||band.max<=item.maxSqft)).map(item=>({lineId:line.id,service:line.description,currency:item.currency,lowerCents:item.lowerCents,upperCents:item.upperCents,note:item.note})));
}
