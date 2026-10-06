import {useRef,useState} from 'react';
import type {InvoiceDraft} from '../server/types';

// Synchronous recovery copy protects the last keystroke on tab close; serialized
// optimistic saves protect against out-of-order responses and another session.
export function useDraftSave(send:(draft:InvoiceDraft)=>Promise<InvoiceDraft>){
 const pending=useRef<InvoiceDraft|null>(null),running=useRef<Promise<void>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [state,setState]=useState('All changes saved');
 const key=(id:string)=>`jfm-draft-recovery:${id}`;
 const recover=(draft:InvoiceDraft)=>{try{const cached=JSON.parse(localStorage.getItem(key(draft.id))||'null');if(cached?.id===draft.id&&cached.updatedAt===draft.updatedAt){pending.current=cached;setState('Recovered unsaved changes');return cached as InvoiceDraft;}if(cached){setState('Recovery conflict — another version was saved.');}}catch{}return draft;};
 const flush=async():Promise<void>=>{
  if(timer.current)clearTimeout(timer.current);
  if(running.current){await running.current;if(pending.current)return flush();return;}
  if(!pending.current)return;
  const task=(async()=>{while(pending.current){const draft=pending.current;setState('Saving…');try{const saved=await send(draft);if(pending.current===draft){pending.current=null;localStorage.removeItem(key(draft.id));}else if(pending.current?.id===draft.id){pending.current={...pending.current,updatedAt:saved.updatedAt};localStorage.setItem(key(draft.id),JSON.stringify(pending.current));}setState('All changes saved');}catch(error){setState(`Not saved — ${(error as Error).message}`);throw error;}}})();
  running.current=task;try{await task;}finally{running.current=null;}
 };
 const queue=(draft:InvoiceDraft)=>{pending.current=draft;try{localStorage.setItem(key(draft.id),JSON.stringify(draft));setState('Saving…');}catch{setState('Saving… browser recovery unavailable');}if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{void flush().catch(()=>{});},550);};
 return {state,recover,queue,flush};
}
