import {normalizePurchaseText,validateExtraction} from './purchase-contract.js';
import {extractPurchaseItems,purchaseContext} from './purchase-provider.js';

export function createWorkerClient({url,key,workerKey,fetchImpl=fetch}){
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||typeof key!=='string'||key.startsWith('sb_secret_')||typeof workerKey!=='string'||workerKey.length<40)throw Error('Configure the Supabase publishable key and scoped worker credential.');
 async function rpc(name,body){
  const response=await fetchImpl(`${url}/rest/v1/rpc/${name}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({worker_key:workerKey,...body})});
  if(!response.ok)throw Object.assign(Error(`Worker RPC failed (${response.status})`),{status:response.status});
  return response.json();
 }
 return {claim:model=>rpc('claim_purchase_job',{model_name:model}),finish:(job,result,error)=>rpc('finish_purchase_job',{job_id:job.id,lease:job.leaseToken,prediction:result?.data||null,model_metadata:result?.metadata||null,failure_code:error?.code||null})};
}
export async function runClaimedPurchase(job,{provider=extractPurchaseItems,signal}={}){
 const source=normalizePurchaseText(job.source?.text);if(source.hash!==job.source.hash)throw Error('Source hash mismatch');purchaseContext(source);
 const result=await provider(source,{signal,timeoutMs:Math.min(120000,job.deadlineMs||120000)});
 result.data=validateExtraction(result.data,source);return result;
}
export async function tunedPurchaseProvider(source,{signal,timeoutMs=120000}={}){
 const start=performance.now();const r=await fetch('http://127.0.0.1:4182/extract',{method:'POST',redirect:'error',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(timeoutMs)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({text:source.text})});
 if(!r.ok)throw Object.assign(Error('Local adapter inference failed'),{code:'EXTRACTION_FAILED'});
 const result=await r.json();return {data:validateExtraction(result.data,source),metadata:{...result.metadata,latencyMs:Math.round(performance.now()-start)}};
}
