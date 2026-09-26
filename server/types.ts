export type RawEvent = {id:string; start:string; end:string; title:string; location?:string; status?:string; recurring?:boolean};
export type Job = {id:string; source:string; sourceId:string; title:string; client:string; services:string[]; notes:string[]; start:string; end:string; location:string; status:'Booked'|'Held'|'To reschedule'|'Cancelled'|'Needs review'; issues:string[]; due:string|null; deadlineBasis:string; updatedAt:string};
export type SyncState = {id:string; label:string; mode:'export'|'live'|'not-connected'; lastAttempt:string|null; lastSuccess:string|null; snapshotAt:string|null; error:string|null; count:number; syncToken?:string};
export type Review = {id:string; kind:string; title:string; detail:string; jobId:string|null; source:string; status:'open'|'reviewed'|'dismissed'; resolution?:string; updatedAt:string};
export type InvoiceLine = {id:string;description:string;quantity:number;unitPriceCents:number};
export type InvoiceDraft = {
 id:string;jobId:string;status:'draft'|'ready';client:string;property:string;squareFeet:string;
 currency:'CAD'|'USD';invoiceDate:string;dueDate:string;completionConfirmed:boolean;
 taxTreatment:'review'|'no-tax'|'taxable';taxRateBps:number;taxNote:string;
 lines:InvoiceLine[];notes:string;createdAt:string;updatedAt:string;
};
