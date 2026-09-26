import {randomBytes,createHash,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import type {Request,Response,Express} from 'express';
import type {Store} from './store.ts';
import {config,validEncryptionKey} from './config.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export function seal(value:string,key=config.encryptionKey){const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv);const data=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');}
export function unseal(value:string,key=config.encryptionKey){const b=Buffer.from(value,'base64');const c=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8');}
function cookie(req:Request,name:string){return req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
const cookieOptions={httpOnly:true,sameSite:'lax' as const,secure:config.mode!=='local',path:'/'};
export function signedIn(req:Request,store:Store){
 if(config.mode==='local')return true;
 store.db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
 return !!store.db.prepare('SELECT hash FROM sessions WHERE hash=? AND expires>?').get(hash(cookie(req,'jfm_session')),Date.now());
}
export function authRoutes(app:Express,store:Store){
 app.get('/auth/start',(req,res)=>{
  const kind=req.query.kind==='calendar'?'calendar':'login';
  if(kind==='calendar'&&!signedIn(req,store))return res.status(401).send('Sign in first');
  if(!config.clientId||!config.clientSecret||!validEncryptionKey())return res.status(503).send('Google connection setup is pending. See Settings in the Hub.');
  const state=random(),nonce=random(),verifier=random(),binding=random();
  store.db.prepare('DELETE FROM oauth WHERE expires<?').run(Date.now());
  store.db.prepare('INSERT INTO oauth VALUES(?,?,?)').run(hash(state),Date.now()+600000,JSON.stringify({kind,nonce,verifier,binding:hash(binding)}));
  res.cookie('jfm_oauth',binding,{...cookieOptions,maxAge:600000});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [k,v] of Object.entries({client_id:config.clientId,redirect_uri:config.origin+'/auth/callback',response_type:'code',scope:kind==='calendar'?'openid email https://www.googleapis.com/auth/calendar.readonly':'openid email',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:kind==='calendar'?'offline':'online',prompt:kind==='calendar'?'consent select_account':'select_account',login_hint:kind==='calendar'?config.calendarEmail:config.businessEmail}))url.searchParams.set(k,v);
  res.redirect(url.toString());
 });
 app.get('/auth/callback',async(req,res)=>{
  try {
   const state=String(req.query.state||'');const row=store.db.prepare('SELECT payload FROM oauth WHERE state=? AND expires>?').get(hash(state),Date.now()) as {payload:string}|undefined;
   if(!row)throw new Error('Expired sign-in');const attempt=JSON.parse(row.payload);
   if(attempt.binding!==hash(cookie(req,'jfm_oauth')))throw new Error('Wrong browser');
   store.db.prepare('DELETE FROM oauth WHERE state=?').run(hash(state));res.clearCookie('jfm_oauth',cookieOptions);
   const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code:String(req.query.code||''),code_verifier:attempt.verifier,redirect_uri:config.origin+'/auth/callback',grant_type:'authorization_code'}),signal:AbortSignal.timeout(30000)});
   if(!result.ok)throw new Error('Sign-in declined');const tokens=await result.json() as any;
   const {payload}=await jwtVerify(tokens.id_token,keys,{audience:config.clientId,issuer:['https://accounts.google.com','accounts.google.com'],algorithms:['RS256']});
   const email=attempt.kind==='calendar'?config.calendarEmail:config.businessEmail;
   if(payload.nonce!==attempt.nonce||payload.email_verified!==true||payload.email!==email||!payload.sub)throw new Error('Account not allowed');
   const subjectKey=attempt.kind+'-subject';const known=store.getSetting(subjectKey);if(known&&known!==payload.sub)throw new Error('Identity changed');
   if(attempt.kind==='calendar'){
    if(!tokens.refresh_token)throw new Error('Offline access was not granted');
    const scopes=String(tokens.scope||'').split(' ');if(!scopes.includes('https://www.googleapis.com/auth/calendar.readonly'))throw new Error('Calendar access not granted');
    store.setSetting('calendar-refresh',seal(tokens.refresh_token));store.setSetting('calendar-account',email);
   }else{const session=random();store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(hash(session),Date.now()+12*3600000);res.cookie('jfm_session',session,{...cookieOptions,maxAge:12*3600000});}
   store.setSetting(subjectKey,String(payload.sub));store.audit('google-'+attempt.kind,'account');res.redirect('/');
  }catch{res.status(400).send('Could not connect that account. Return to the Hub and try again with the intended Google account.');}
 });
 app.post('/auth/logout',(req,res)=>{if(req.headers.origin!==config.origin)return res.sendStatus(403);store.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(cookie(req,'jfm_session')));res.clearCookie('jfm_session',cookieOptions);res.json({ok:true});});
}
export async function calendarAccessToken(store:Store){const secret=store.getSetting('calendar-refresh');if(!secret)throw new Error('Connect the booking calendar first.');const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:unseal(secret),grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Calendar authorization expired. Reconnect.');const body=await response.json() as any;if(!body.access_token)throw new Error('Calendar authorization failed.');return String(body.access_token);}
