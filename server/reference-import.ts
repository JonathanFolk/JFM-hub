import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parse} from 'csv-parse/sync';
import type {Store} from './store.ts';

export const referenceDatasets=['customers_master','invoices_2026_extracted','pricing_2026Q2','audit_backtest_2026','legacy_list_match','acronyms_v0'] as const;

export function importReferenceZip(store:Store,zipPath:string,replace=false){
 const bundle:Record<string,Record<string,string>[]>={};
 for(const name of referenceDatasets){
  // Read only the six named CSVs. The archive's old specification is deliberately never opened.
  const csv=execFileSync('unzip',['-p',zipPath,`${name}.csv`],{encoding:'utf8',maxBuffer:10_000_000});
  const rows=parse(csv,{columns:true,skip_empty_lines:true,bom:true,relax_quotes:false}) as Record<string,string>[];
  if(!rows.length||rows.some(row=>!row||typeof row!=='object'))throw new Error(`Invalid ${name}.csv`);
  bundle[name]=rows;
 }
 const hash=createHash('sha256').update(readFileSync(zipPath)).digest('hex');
 store.importReferenceBundle(bundle,hash,replace);
 return {sourceHash:hash,counts:Object.fromEntries(referenceDatasets.map(name=>[name,bundle[name].length]))};
}
