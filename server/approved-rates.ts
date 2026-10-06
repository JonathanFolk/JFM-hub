import type {Rate,RateGuidance,ShootCategory} from './types.ts';

type Row={category:ShootCategory;service:string;range:string;min:number|null;max:number|null;dollars:number;unit:Rate['unit'];source:string;note:string};
const photo='2026 Q2 Photo';
const video='2026 Q2a Video';
const rows:Row[]=[];
const add=(category:ShootCategory,service:string,range:string,min:number|null,max:number|null,dollars:number,unit:Rate['unit'],source:string,note='')=>rows.push({category,service,range,min,max,dollars,unit,source,note});

add('Real Estate','Editorial/Premium photography — up to 5 images','',null,null,200,'job',photo);
add('Real Estate','Editorial/Premium photography — up to 10 images','',null,null,300,'job',photo);
for(const [range,min,max,dollars] of [
 ['Under 2,500 sq ft',0,2499,350],['2,501–3,500 sq ft',2501,3500,450],['3,501–4,500 sq ft',3501,4500,550],['4,501–6,000 sq ft',4501,6000,700],['6,001–7,500 sq ft',6001,7500,850]
] as const)add('Real Estate','Premium photo',range,min,max,dollars,'job',photo,range==='6,001–7,500 sq ft'?'The sheet says 7,001+ for custom quotes; owner confirmed that is a typo for 7,501+.':'');
for(const [range,min,max,dollars] of [
 ['Under 1,000 sq ft',0,999,225],['1,001–2,500 sq ft',1001,2500,255],['2,501–3,500 sq ft',2501,3500,310],['3,501–4,500 sq ft',3501,4500,340],['4,501–5,500 sq ft',4501,5500,380]
] as const)add('Real Estate','Basic photo',range,min,max,dollars,'job',photo);
add('Real Estate','Add-on Premium Shots','',null,null,150,'job',photo,'5–10 editorial/premium images.');
add('Real Estate','Virtual Staging','',null,null,30,'image',photo);
add('Real Estate','Essentials Aerial Drone (<6 Photos)','',null,null,200,'job',photo);
add('Real Estate','Full Aerial Drone (<15 Photos)','',null,null,350,'job',photo);
add('Real Estate','Standalone Aerial Drone Visit (Photo)','',null,null,100,'job',photo);
add('Real Estate','Golden/Twilight Time add-on (Photo)','',null,null,225,'job',photo);
add('Real Estate','Golden/Twilight Time exterior only (Photo)','',null,null,200,'job',photo);
add('Real Estate','Rush Expedited Delivery','',null,null,75,'service',photo,'24-hour delivery per service, subject to availability.');
add('Real Estate','Image Retouching','',null,null,25,'image',photo);

for(const [range,min,max,dollars] of [
 ['Under 2,500 sq ft',0,2499,425],['2,501–3,500 sq ft',2501,3500,500],['3,501–4,500 sq ft',3501,4500,575],['4,501–6,000 sq ft',4501,6000,725],['6,001–7,500 sq ft',6001,7500,825]
] as const)add('Real Estate','Video',range,min,max,dollars,'job',video,'One horizontal or vertical deliverable; two free revisions included.');
add('Real Estate','IG Reels / YouTube Shorts','',null,null,150,'deliverable',video);
add('Real Estate','Aerial Drone Video (<6 Photos Included)','',null,null,275,'job',video);
add('Real Estate','Premium Aerial Drone (Video)','',null,null,350,'job',video);
add('Real Estate','Standalone Aerial Drone Visit (Video)','',null,null,100,'job',video);
add('Real Estate','Golden/Twilight Time add-on (Video)','',null,null,225,'job',video);
add('Real Estate','Golden/Twilight Time exterior only (Video)','',null,null,200,'job',video);
add('Real Estate','Lifestyle neighborhood (15–90 min)','',null,null,100,'job',video);
add('Real Estate','Basic Walk and Talk','',null,null,75,'job',video);
add('Real Estate','Full Walk and Talk (<30 min)','',null,null,175,'job',video);
add('Real Estate','Neighborhood Full Walk and Talk (<90 min)','',null,null,300,'job',video);
add('Real Estate','Music Change','',null,null,125,'job',video);

add('Commercial','Commercial video short visit (<2 hrs)','',null,null,400,'job',video);
add('Commercial','Commercial video half-day (<4 hrs)','',null,null,800,'job',video);
add('Commercial','Commercial video full-day (<8 hrs)','',null,null,1000,'job',video);
add('Commercial','Commercial video deliverable (15–30 sec)','',null,null,250,'deliverable',video);
add('Commercial','Commercial video deliverable (30–60 sec)','',null,null,450,'deliverable',video);
add('Commercial','Commercial video deliverable (60–120 sec)','',null,null,700,'deliverable',video);

export function approvedRates(currency:'CAD'|'USD'):Rate[]{
 const updatedAt='2026-09-26T00:00:00.000Z';
 return rows.map((row,index)=>({id:`approved-2026-q2-${String(index+1).padStart(3,'0')}`,profile:'standard',category:row.category,service:row.service,squareFootageRange:row.range,minSqft:row.min,maxSqft:row.max,currency,unitPriceCents:row.dollars*100,unit:row.unit,source:row.source,note:row.note,updatedAt}));
}
const legacyOverrides=new Map<string,number>([
 ['Premium photo|2,501–3,500 sq ft',400],['Premium photo|3,501–4,500 sq ft',450],['Premium photo|4,501–6,000 sq ft',550],['Premium photo|6,001–7,500 sq ft',650],
 ['Basic photo|2,501–3,500 sq ft',285],['Basic photo|3,501–4,500 sq ft',315],['Basic photo|4,501–5,500 sq ft',355],
 ['Essentials Aerial Drone (<6 Photos)|',175],['Golden/Twilight Time add-on (Photo)|',200],['Golden/Twilight Time exterior only (Photo)|',175],
 ['Video|Under 2,500 sq ft',350],['Video|2,501–3,500 sq ft',400],['Video|3,501–4,500 sq ft',450],['Video|4,501–6,000 sq ft',600],['Video|6,001–7,500 sq ft',700],
 ['IG Reels / YouTube Shorts|',125],['Aerial Drone Video (<6 Photos Included)|',250],['Golden/Twilight Time add-on (Video)|',200],['Golden/Twilight Time exterior only (Video)|',175],
 ['Commercial video half-day (<4 hrs)|',500],['Commercial video full-day (<8 hrs)|',850],['Commercial video deliverable (30–60 sec)|',400],['Commercial video deliverable (60–120 sec)|',600]
]);
export function legacyRates():Rate[]{
 const base=approvedRates('CAD').filter(rate=>rate.service!=='Commercial video short visit (<2 hrs)');
 const transformed=base.map(rate=>({...rate,id:rate.id.replace('approved-2026-q2','legacy-2026-q2'),profile:'legacy' as const,unitPriceCents:(legacyOverrides.get(`${rate.service}|${rate.squareFootageRange}`)??rate.unitPriceCents/100)*100,source:rate.source.includes('Video')?'2026 Q2 Legacy Video':'2026 Q2 Legacy Photo',note:rate.note}));
 const at='2026-09-26T00:00:00.000Z';
 return [...transformed,
  {id:'legacy-2026-q2-studio-interview',profile:'legacy',category:'Commercial',service:'Studio Interview',squareFootageRange:'',minSqft:null,maxSqft:null,currency:'CAD',unitPriceCents:75000,unit:'job',source:'2026 Q2 Legacy Video',note:'Legacy video sheet only.',updatedAt:at},
  {id:'legacy-2026-q2-model-lifestyle',profile:'legacy',category:'Commercial',service:'Model On-Cam Lifestyle',squareFootageRange:'',minSqft:null,maxSqft:null,currency:'CAD',unitPriceCents:50000,unit:'job',source:'2026 Q2 Legacy Video',note:'Legacy video sheet only.',updatedAt:at}
 ];
}
const standardGuidance:Omit<RateGuidance,'profile'>[]=[
 {id:'approved-2026-q2-premium-over-7500',category:'Real Estate',service:'Premium photo',minSqft:7501,maxSqft:null,currency:'CAD',lowerCents:100000,upperCents:125000,note:'Custom quote required. Confirm the actual price before invoicing; the owner expects roughly CAD $1,000–$1,250.',source:photo},
 {id:'approved-2026-q2-basic-over-5500',category:'Real Estate',service:'Basic photo',minSqft:5501,maxSqft:null,currency:'CAD',lowerCents:null,upperCents:null,note:'The rate sheet says 5,501+ sq ft: contact for quote. Enter a confirmed custom price.',source:photo},
 {id:'approved-2026-q2-video-over-7500',category:'Real Estate',service:'Video',minSqft:7501,maxSqft:null,currency:'CAD',lowerCents:null,upperCents:null,note:'The video sheet has no published rate above 7,500 sq ft. Confirm a custom price.',source:video},
 {id:'approved-2026-q2-floorplan-quote',category:'Real Estate',service:'Floor plan',minSqft:0,maxSqft:null,currency:'CAD',lowerCents:null,upperCents:null,note:'The photo sheet lists floor plans as contact for quote. Enter a confirmed price.',source:photo},
 {id:'approved-2026-q2-3dfloorplan-quote',category:'Real Estate',service:'3D floor plan',minSqft:0,maxSqft:null,currency:'CAD',lowerCents:null,upperCents:null,note:'The photo sheet lists floor plans as contact for quote. Enter a confirmed price.',source:photo},
 {id:'approved-2026-q2-drone-options',category:'Real Estate',service:'Drone',minSqft:0,maxSqft:null,currency:'CAD',lowerCents:null,upperCents:null,note:'The sheets list several aerial packages. Confirm the requested package before selecting its rate.',source:photo},
 {id:'approved-2026-q2-twilight-options',category:'Real Estate',service:'Twilight',minSqft:0,maxSqft:null,currency:'CAD',lowerCents:null,upperCents:null,note:'The sheets distinguish full twilight and exterior-only add-ons. Confirm which applies.',source:photo},
 {id:'approved-2026-q2-premium-2500-gap',category:'Real Estate',service:'Premium photo',minSqft:2500,maxSqft:2500,currency:'CAD',lowerCents:null,upperCents:null,note:'The sheet says under 2,500 and then 2,501–3,500 sq ft. Confirm the price for exactly 2,500 sq ft.',source:photo},
 {id:'approved-2026-q2-video-2500-gap',category:'Real Estate',service:'Video',minSqft:2500,maxSqft:2500,currency:'CAD',lowerCents:null,upperCents:null,note:'The sheet says below 2,500 and then 2,501–3,500 sq ft. Confirm the price for exactly 2,500 sq ft.',source:video},
 {id:'approved-2026-q2-basic-1000-gap',category:'Real Estate',service:'Basic photo',minSqft:1000,maxSqft:1000,currency:'CAD',lowerCents:null,upperCents:null,note:'The sheet says under 1,000 and then 1,001–2,500 sq ft. Confirm the price for exactly 1,000 sq ft.',source:photo}
];
export const approvedGuidance:RateGuidance[]=[...standardGuidance.map(item=>({...item,profile:'standard' as const})),...standardGuidance.map(item=>({...item,id:item.id.replace('approved-2026-q2','legacy-2026-q2'),profile:'legacy' as const,source:item.source.includes('Video')?'2026 Q2 Legacy Video':'2026 Q2 Legacy Photo',lowerCents:item.id==='approved-2026-q2-premium-over-7500'?null:item.lowerCents,upperCents:item.id==='approved-2026-q2-premium-over-7500'?null:item.upperCents,note:item.id==='approved-2026-q2-premium-over-7500'?'Legacy premium photo above 7,500 sq ft requires a confirmed custom price.':item.note}))];

export function commercialPhotoRates():Rate[]{
 const rows:[string,number,Rate['unit'],string][]=[
  ['Developer Residential — staged',750,'job',''],['Developer Residential — vacant',350,'job',''],
  ['Commercial Exterior — on-site base',450,'job','Architectural-style photography.'],['Commercial Exterior — after-hours twilight',150,'job','Only when requested.'],
  ['Commercial Exterior — edited deliverable',20,'image','No object-removal Photoshop.'],['Commercial Exterior — advanced Photoshop',25,'image','Additional to normal editing, per affected image.'],
  ['Commercial Exterior — drone launch',200,'job','DJI Mavic 4 Pro Telephoto Series. Complimentary Transport Canada airspace unlocking (NAV Canada / ATC).'],
  ['Interior Design S — short visit',750,'job','No image cap. Confirm short-visit duration.'],['Interior Design S — 4 hours',1250,'job','No image cap.'],
  ['Interior Design L — short visit',750,'job','20-image allowance versus no cap needs owner confirmation.'],['Interior Design L — 4 hours',1250,'job','30-image allowance versus no cap needs owner confirmation.']
 ];
 return rows.map(([service,dollars,unit,note],index)=>({id:`commercial-photo-2026-09-${index}`,profile:'standard',category:'Commercial',service,squareFootageRange:'',minSqft:null,maxSqft:null,currency:'CAD',unitPriceCents:dollars*100,unit,source:'Owner update · 2026-09-26',note,updatedAt:'2026-09-26T00:00:00.000Z'}));
}
