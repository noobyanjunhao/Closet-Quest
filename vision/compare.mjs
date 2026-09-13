import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
env.cacheDir = '.model-cache';
env.allowLocalModels = false;
const manifestBytes=readFileSync('vision/data/manifest.json'),manifest=JSON.parse(manifestBytes);
const labels={Top:'a shirt or sweater',Bottom:'a pair of trousers',Shoes:'a shoe',Outerwear:'a jacket or coat',Dress:'a dress',Accessory:'a handbag'};
const models=['Xenova/clip-vit-base-patch32','Xenova/siglip-base-patch16-224'];
let revisions=existsSync('vision/model-revisions.json')?JSON.parse(readFileSync('vision/model-revisions.json')):{};
const rows=[],summary=[];
mkdirSync('vision/results',{recursive:true});
for(const model of models){
  if(!revisions[model]){
    const response=await fetch(`https://huggingface.co/api/models/${model}`);
    if(!response.ok)throw new Error(`Model revision lookup failed: ${response.status}`);
    revisions[model]=(await response.json()).sha;
    writeFileSync('vision/model-revisions.json',JSON.stringify(revisions,null,2)+'\n');
  }
  console.log(`Loading ${model} at ${revisions[model]} (q8 CPU)...`);
  const loadStart=performance.now();
  const classify=await pipeline('zero-shot-image-classification',model,{revision:revisions[model],dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:4,interOpNumThreads:1}});
  const loadMs=performance.now()-loadStart,times=[];let correct=0;
  await classify(manifest.images[0].path,Object.values(labels),{hypothesis_template:'a photo of {}'});
  for(const item of manifest.images){
    if(createHash('sha256').update(readFileSync(item.path)).digest('hex')!==item.sha256)throw new Error('Fixture hash mismatch');
    const start=performance.now();
    const prediction=await classify(item.path,Object.values(labels),{hypothesis_template:'a photo of {}'});
    const elapsedMs=performance.now()-start;times.push(elapsedMs);
    const predicted=Object.keys(labels).find(key=>labels[key]===prediction[0].label);
    if(predicted===item.category)correct++;
    rows.push({model,id:item.id,expected:item.category,predicted,elapsedMs,scores:prediction});
    console.log(`${item.id}: ${predicted} (expected ${item.category}) ${Math.round(elapsedMs)} ms`);
  }
  times.sort((a,b)=>a-b);
  summary.push({model,revision:revisions[model],dtype:'q8',device:'cpu',correct,total:manifest.images.length,accuracy:correct/manifest.images.length,loadIncludingDownloadMs:loadMs,p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1]});
  await classify.dispose();
  writeFileSync('vision/results/latest.json',JSON.stringify({generatedAt:new Date().toISOString(),node:process.version,environment:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,ramGiB:Math.round(os.totalmem()/1024**3)},lockfileSha256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),labels,hypothesisTemplate:'a photo of {}',scope:manifest.provenance,filenameBaseline:{correct:manifest.images.filter(i=>i.category==='Top').length,total:manifest.images.length,description:'Existing filename heuristic returns Top for every anonymous image-NN.png.'},summary,rows},null,2)+'\n');
}
console.log(JSON.stringify(summary,null,2));
