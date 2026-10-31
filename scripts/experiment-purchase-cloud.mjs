import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createWorkerClient,runClaimedPurchase} from '../server/purchase-worker-client.js';
import {fixturePurchaseProvider} from '../server/purchase-provider.js';
const config=JSON.parse(readFileSync('.local-data/deployment/purchase-worker.json','utf8')),client=createWorkerClient(config),seed=JSON.parse(readFileSync('.local-data/deployment/purchase-experiment.json','utf8'));
const checks=[];async function check(name,fn){const start=performance.now();try{await fn();checks.push({name,passed:true,elapsedMs:performance.now()-start});}catch(e){checks.push({name,passed:false,error:e.message,elapsedMs:performance.now()-start});throw e;}}
try{
 await check('invalid worker credential denied',()=>assert.rejects(createWorkerClient({...config,workerKey:'invalid-credential-xxxxxxxxxxxxxxxxxxxxxxxxxx'}).claim('test'),e=>[401,403].includes(e.status)));
 await check('anonymous draft read denied',async()=>{const r=await fetch(`${config.url}/rest/v1/purchase_imports?select=id`,{headers:{apikey:config.key},signal:AbortSignal.timeout(15000)});assert.ok([401,403].includes(r.status));});
 let job;
 await check('three simultaneous claims grant one lease',async()=>{const results=await Promise.all([client.claim('cloud-protocol-fixture'),client.claim('cloud-protocol-fixture'),client.claim('cloud-protocol-fixture')]);const jobs=results.filter(Boolean);assert.equal(jobs.length,1);job=jobs[0];assert.equal(job.id,seed.id);});
 const result=await runClaimedPurchase(job,{provider:fixturePurchaseProvider});
 await check('wrong lease cannot complete',async()=>assert.equal(await client.finish({...job,leaseToken:randomUUID()},result),false));
 await check('validated result completes draft',async()=>assert.equal(await client.finish(job,result),true));
 await check('lost-response replay acknowledges same completion',async()=>assert.equal(await client.finish(job,result),true));
}finally{
 const output={environment:'live Supabase HTTPS/PostgREST',synthetic:true,modelInference:false,provider:'fixture for transport/queue experiment only',checks,passed:checks.filter(c=>c.passed).length,total:checks.length};mkdirSync('output/purchase-ml/cloud',{recursive:true});writeFileSync('output/purchase-ml/cloud/live-http-results.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
}
