// Small serial timing follow-up. Do not run while another model experiment is active.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const python=process.env.PURCHASE_PYTHON||'ml/.venv/Scripts/python.exe';
const summary={synthetic:true,split:'validation',examples:5,order:['base','adapter'],concurrentInference:false,notes:'Fixed-order serial laptop run, first five validation cases. No other model inference was running; Ollama was unloaded. First generation includes kernel warmup, model load is separate. Four remaining generations are warm. Small sample, no p95 or general latency claim.',models:{}};
for(const mode of summary.order){
 const out=`output/purchase-ml/latency-${mode}`;
 const result=spawnSync(python,['ml/purchase/evaluate.py','--mode',mode,'--split','validation','--limit','5','--out',out],{stdio:'inherit'});
 if(result.status!==0)throw Error(`${mode} benchmark failed`);
 const raw=JSON.parse(readFileSync(`${out}/raw.json`,'utf8')),manifest=JSON.parse(readFileSync(`${out}/manifest.json`,'utf8')),metrics=JSON.parse(readFileSync(`${out}/metrics.json`,'utf8'));
 const times=raw.map(x=>x.elapsedMs).sort((a,b)=>a-b),warm=raw.slice(1).map(x=>x.elapsedMs).sort((a,b)=>a-b);
 summary.models[mode]={ids:raw.map(x=>x.id),loadMs:manifest.loadMs,firstGenerationMs:raw[0].elapsedMs,medianMs:times[2],warmMedianMs:(warm[1]+warm[2])/2,generatedTokens:raw.map(x=>x.generatedTokens),generationErrors:raw.filter(x=>x.error).length,contractValid:metrics.contractValid,exactGarmentDocuments:metrics.exactGarmentDocuments,clothingLines:metrics.clothingLines,emptyResults:raw.filter(x=>x.prediction?.items?.length===0).length};
}
writeFileSync('output/purchase-ml/serial-latency.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
