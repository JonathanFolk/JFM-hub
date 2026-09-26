import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {Store} from '../server/store.ts';
test('HTTP serves the app, excludes secrets, and rejects cross-origin changes',async()=>{
 const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as any).port;await new Promise<void>(r=>probe.close(()=>r()));
 const origin=`http://127.0.0.1:${port}`,dir=mkdtempSync(join(tmpdir(),'jfm-http-'));const seed=new Store(join(dir,'hub.sqlite'));
 const staticDir=join(dir,'dist');mkdirSync(staticDir);writeFileSync(join(staticDir,'index.html'),'<!doctype html><title>JFM Hub test</title>');
 seed.setSync({id:'google-calendar',label:'Test',mode:'live',lastAttempt:null,lastSuccess:null,snapshotAt:null,error:null,count:0,syncToken:'must-not-leak'});
 seed.review({id:'synthetic',kind:'Check booking',title:'Synthetic client',detail:'Test only',jobId:null,source:'test',status:'open',updatedAt:new Date().toISOString()});seed.close();
 const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,APP_MODE:'local',PORT:String(port),APP_ORIGIN:origin,DATA_DIR:dir,BACKUP_DIR:join(dir,'backups'),STATIC_DIR:staticDir},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise<void>((resolve,reject)=>{let stderr='';const timeout=setTimeout(()=>reject(new Error('Server startup timed out: '+stderr)),10000);child.stderr.on('data',data=>stderr+=String(data));child.stdout.on('data',()=>{clearTimeout(timeout);resolve();});child.on('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited (${code}): ${stderr}`));});});
 assert.equal((await fetch(origin)).status,200);
 const dashboard=await (await fetch(origin+'/api/dashboard')).text();assert.ok(!dashboard.includes('must-not-leak'));assert.ok(!dashboard.includes('syncToken'));
 const post=(headers:Record<string,string>)=>fetch(origin+'/api/reviews/synthetic',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({status:'reviewed',resolution:'Synthetic review'})});
 assert.equal((await post({Origin:'https://other.example','X-JFM-Request':'1'})).status,403);
 assert.equal((await post({Origin:origin})).status,403);
 assert.equal((await post({Origin:origin,'X-JFM-Request':'1'})).status,200);
 assert.equal((await fetch(origin+'/api/unknown')).status,404);
 assert.equal((await fetch(origin+'/auth/callback?state=forged&code=forged')).status,400);
 assert.deepEqual(await (await fetch(origin+'/healthz')).json(),{ok:true});
 const stored=new Store(join(dir,'hub.sqlite'));assert.equal(stored.reviews()[0].resolution,'Synthetic review');stored.close();
 }finally{
 const stopped=new Promise<void>(r=>child.once('exit',()=>r()));child.kill('SIGTERM');await stopped;rmSync(dir,{recursive:true,force:true});
 }
});
