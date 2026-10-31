// One real cloud job with the saved LoRA checkpoint; never approves wardrobe writes.
import {readFileSync,writeFileSync} from 'node:fs';
import {createWorkerClient,runClaimedPurchase,tunedPurchaseProvider} from '../server/purchase-worker-client.js';
const config=JSON.parse(readFileSync('.local-data/deployment/purchase-worker.json','utf8'));
const seed=JSON.parse(readFileSync('.local-data/deployment/purchase-experiment.json','utf8'));
const client=createWorkerClient(config),start=performance.now();
const job=await client.claim('purchase-lora-v1-experiment');
if(!job||job.id!==seed.id)throw Error('Expected the isolated synthetic experiment draft');
let result,error;
try{result=await runClaimedPurchase(job,{provider:tunedPurchaseProvider,signal:AbortSignal.timeout(120000)});}
catch(e){error={code:e.code||'EXTRACTION_FAILED',message:e.message};}
const accepted=await client.finish(job,result,error);
const report={environment:'Live Supabase HTTPS + local saved LoRA adapter',synthetic:true,modelInference:true,accepted,status:error?'failed':'review_required',elapsedMs:performance.now()-start,model:result?.metadata||null,prediction:result?.data||null,error:error||null,wardrobeWrites:0,concurrentBaseEvaluation:true};
writeFileSync('output/purchase-ml/cloud/live-candidate-result.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
