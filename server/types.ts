export type RawEvent = {id:string; start:string; end:string; title:string; location?:string; description?:string; status?:string; recurring?:boolean};
export type Job = {id:string; source:string; sourceId:string; title:string; client:string; services:string[]; notes:string[]; description?:string; area?:number; areaIssue?:string; floorPlanSource?:boolean; supportingJobId?:string; start:string; end:string; location:string; status:'Booked'|'Held'|'To reschedule'|'Unconfirmed'|'Cancelled'|'Needs review'; issues:string[]; due:string|null; deadlineBasis:string; updatedAt:string};
export type SyncState = {id:string; label:string; mode:'export'|'live'|'not-connected'; lastAttempt:string|null; lastSuccess:string|null; snapshotAt:string|null; error:string|null; count:number; syncToken?:string};
export type Review = {id:string; kind:string; title:string; detail:string; jobId:string|null; source:string; status:'open'|'reviewed'|'dismissed'; resolution?:string; updatedAt:string};
export type ShootCategory='Real Estate'|'Commercial'|'Design'|'Other';
export type PricingProfile='standard'|'legacy';
export const shootCategories:ShootCategory[]=['Real Estate','Commercial','Other'];
export const commercialSubtypes=['Developer Residential','Commercial Exterior','Interior Design S','Interior Design L','Misc Commercial'] as const;
export type CommercialSubtype=typeof commercialSubtypes[number];
export type SortDetails={commercialSubtype?:CommercialSubtype;commercialPackage?:'staged'|'vacant'|'short'|'half';imageCount?:number;retouchCount?:number;twilight?:boolean;drone?:boolean};
export const imagePackages=['Up to 5 images only','Up to 10 images only'];
export const squareFootageBands=[
 {label:'Under 1,000 sq ft',min:0,max:999},
 {label:'1,000 sq ft',min:1000,max:1000},
 {label:'1,001–2,499 sq ft',min:1001,max:2499},
 {label:'2,500 sq ft',min:2500,max:2500},
 {label:'Under 2,500 sq ft',min:0,max:2499},
 {label:'2,501–3,500 sq ft',min:2501,max:3500},
 {label:'3,501–4,500 sq ft',min:3501,max:4500},
 {label:'4,501–5,500 sq ft',min:4501,max:5500},
 {label:'5,501–6,000 sq ft',min:5501,max:6000},
 {label:'6,001–7,000 sq ft',min:6001,max:7000},
 {label:'7,001–7,500 sq ft',min:7001,max:7500},
 {label:'Over 7,500 sq ft',min:7501,max:Number.MAX_SAFE_INTEGER}
];
export const squareFootageRanges=[...imagePackages,'Under 1,000 sq ft','Under 2,500 sq ft',...squareFootageBands.filter(band=>band.min>=2501).map(band=>band.label)];
export type ShootSort=SortDetails&{jobId:string;category:ShootCategory;squareFootageRange:string;updatedAt:string};
export type DeletedItem={reviewId:string;jobId:string|null;title:string;deletedAt:string};
export type Rate={id:string;profile:PricingProfile;category:ShootCategory;service:string;squareFootageRange:string;minSqft:number|null;maxSqft:number|null;currency:'CAD'|'USD';unitPriceCents:number;unit:'job'|'image'|'service'|'deliverable';source:string;note:string;updatedAt:string};
export type PriceSuggestion={lineId:string;rateId:string;amountCents:number;currency:'CAD'|'USD';service:string;profile:PricingProfile};
export type RateGuidance={id:string;profile:PricingProfile;category:ShootCategory;service:string;minSqft:number;maxSqft:number|null;currency:'CAD'|'USD';lowerCents:number|null;upperCents:number|null;note:string;source:string};
export type CustomPricePrompt={lineId:string;service:string;currency:'CAD'|'USD';lowerCents:number|null;upperCents:number|null;note:string};
export type EmailPriceSuggestion={messageId:string;threadId:string;subject:string;from:string;date:string;amountCents:number;currency:'CAD'|'USD';excerpt:string};
export type InvoiceSheetRow={row:number;number:string;client:string;totalCents:number|null;paid:boolean;notes:string};
export type ReconciliationSuggestion={
 id:string;kind:'sent'|'payment';source:'gmail';sourceId:string;threadId:string;subject:string;from:string;date:string;excerpt:string;
 invoiceNumbers:string[];amountCents:number|null;currency:'CAD'|'USD'|null;candidateRows:InvoiceSheetRow[];
 match:'invoice-number'|'amount-mismatch'|'amount-and-client'|'amount-only'|'ambiguous'|'unmatched';
 status:'open'|'confirmed'|'dismissed';resolution:string;createdAt:string;updatedAt:string;
};
export type InvoiceLine = {id:string;description:string;quantity:number;unitPriceCents:number;pricingProfileOverride?:PricingProfile|null;rateSource?:string};
export type InvoiceDraft = {
 id:string;jobId:string;status:'draft'|'ready';client:string;property:string;squareFeet:string;
 pricingProfile:'review'|PricingProfile;pricingProfileMode:'automatic'|'invoice';
 currency:'CAD'|'USD';invoiceDate:string;dueDate:string;completionConfirmed:boolean;
 taxTreatment:'review'|'no-tax'|'taxable';taxRateBps:number;taxNote:string;
 lines:InvoiceLine[];notes:string;createdAt:string;updatedAt:string;
};
export type ReferenceCustomer={customerId:string;displayName:string;legacyStatus:string;billingRoute:string;pdfInvoices2026:number;match:'exact'|'ambiguous'|'none';profileHint:'standard'|'legacy'|'review'};
export type ReferenceInvoice={file:string;number:string;issued:string;due:string;balance:string;services:string;reconciles:boolean};
export type AutomaticPricing={profile:'review'|PricingProfile;reason:string;clientOverride:PricingProfile|null;canSetClientOverride:boolean};
export type InvoiceReference={customer:ReferenceCustomer|null;historicalInvoices:ReferenceInvoice[];warning:string;automatic:AutomaticPricing};
