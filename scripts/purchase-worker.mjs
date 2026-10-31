// Outbound HTTPS only. The worker credential cannot read closets or commit pieces.
import {readFileSync} from 'node:fs';
import {createWorkerClient,runClaimedPurchase,tunedPurchaseProvider} from '../server/purchase-worker-client.js';
import {modelFor} from '../server/model-config.js';
const configPath=process.env.CLOSET_WORKER_CONFIG||'.local-data/deployment/purchase-worker.json';
const config=JSON.parse(readFileSync(configPath,'utf8')),client=createWorkerClient(config),candidate=process.argv.includes('--candidate');
let stopped=false;const shutdown=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;shutdown.abort();});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
console.log('Private purchase worker started. Source text and credentials are not logged.');
while(!stopped){
 try{
  const job=await client.claim(candidate?'purchase-lora-v1':modelFor('purchase'));
  if(!job){await wait(3000);continue;}
  const start=performance.now();let result,error;
  try{result=await runClaimedPurchase(job,{...(candidate?{provider:tunedPurchaseProvider}:{}),signal:AbortSignal.any([shutdown.signal,AbortSignal.timeout(120000)])});}
  catch(e){error={code:/^[A-Z_]+$/.test(e.code||'')?e.code:'EXTRACTION_FAILED'};}
  // Retrying the same leased result is safe, including a lost success response.
  let accepted=false;
  for(let attempt=0;attempt<3&&!stopped;attempt++){try{accepted=await client.finish(job,result,error);break;}catch{await wait(1000*(attempt+1));}}
  console.log(JSON.stringify({id:job.id,accepted,outcome:error?.code||'review_required',elapsedMs:Math.round(performance.now()-start)}));
 }catch(e){console.error(JSON.stringify({event:'worker-poll-failed',status:e.status||null}));await wait(e.status===401||e.status===403?30000:5000);}
}
