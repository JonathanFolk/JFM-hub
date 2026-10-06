type ReaderOptions={fetcher?:typeof fetch;sleep?:(ms:number)=>Promise<void>;now?:()=>number;random?:()=>number};
export function createGmailReader(token:string,options:ReaderOptions={}){
 const fetcher=options.fetcher||fetch,sleep=options.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms))),now=options.now||Date.now,random=options.random||Math.random;
 let last=-Infinity;
 return async function get(path:string):Promise<any>{
  for(let attempt=0;;attempt++){
   await sleep(Math.max(0,1000-(now()-last)));last=now();
   const response=await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
   const body=await response.json().catch(()=>({}));
   if(response.ok)return body;
   const reasons=[body.error?.status,...(body.error?.errors||[]).map((e:any)=>e.reason),...(body.error?.details||[]).map((e:any)=>e.reason)].join(' ');
   const limited=response.status===429||response.status===403&&/rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED/i.test(reasons);
   const transient=limited||response.status>=500;
   const retryHeader=response.headers.get('retry-after');
   const retryAfter=retryHeader?Math.max(0,/^\d+$/.test(retryHeader)?Number(retryHeader)*1000:Date.parse(retryHeader)-now()):0;
   if(transient&&attempt<3&&!(retryAfter>30000)){await sleep(Math.max(Number.isFinite(retryAfter)?retryAfter:0,2**attempt*2000+Math.floor(random()*1000)));continue;}
   let message=limited?'Gmail is temporarily rate-limiting this scan. Progress is saved; retry shortly or let the background sync resume.':response.status>=500?'Gmail is temporarily unavailable. Progress is saved; retry later.':response.status===401?'Gmail authorization expired. Reconnect in Connections.':response.status===403?'Google denied Gmail access. Check the Gmail API, read-only permission and Workspace policy.':`Gmail sync failed (${response.status}).`;
   if(/SERVICE_DISABLED|accessNotConfigured/i.test(reasons))message='Gmail API is disabled in the Hub OAuth project. Enable Gmail API, then retry.';
   else if(/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reasons))message='Gmail read-only permission is missing. Reconnect Gmail in Connections as the business account.';
   else if(/domainPolicy/i.test(reasons))message='Your Google Workspace policy blocks the Hub from reading Gmail. Ask the Workspace administrator to review access for this app.';
   throw Object.assign(new Error(message),{status:response.status,retryable:transient});
  }
 };
}
