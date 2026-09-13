import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { recommend as baseline } from './baseline-v1.js';
import { rankOutfits } from '../src/recommender.js';
const source = readFileSync(new URL('./data/wardrobes.json',import.meta.url));
const data = JSON.parse(source);
// Evaluation oracle is deliberately separate from production matching/shape code.
const tagMatch = (i,c) => i.tags.split(',').some(t=>t.trim().toLowerCase()===c.toLowerCase());
function acceptable(outfit, w, q) {
  const cats=outfit.map(i=>i.category).sort().join(',');
  const shape=['Bottom,Shoes,Top','Dress,Shoes','Bottom,Outerwear,Shoes,Top','Dress,Outerwear,Shoes'].includes(cats);
  return shape && new Set(outfit.map(i=>i.id)).size===outfit.length && outfit.every(i=>w.items.some(o=>o.id===i.id) && tagMatch(i,q.context)) && (!q.requireLowUse||outfit.some(i=>i.wears<=1));
}
function oracle(w,q) {
  const groups = cat => w.items.filter(i=>i.category===cat);
  for(const s of groups('Shoes')) {
    const cores=groups('Dress').map(d=>[d,s]);
    for(const t of groups('Top'))for(const b of groups('Bottom'))cores.push([t,b,s]);
    for(const core of cores)for(const layer of [null,...(q.context==='Presentation day'?groups('Outerwear'):[])])if(acceptable(layer?[...core,layer]:core,w,q))return true;
  }
  return false;
}
const methods={baseline:(w,q)=>[0,1,2].map(n=>baseline(w.items,q.context,n)).filter(a=>a.length),prototype:(w,q)=>rankOutfits(w.items,q.context,{requireLowUse:q.requireLowUse}).outfits.map(o=>o.items)};
const raw=[],summary={};
for(const [method,fn]of Object.entries(methods)) {
  const times=[];let eligible=0,hits=0,invalid=0,owned=0,returned=0,impossible=0,abstained=0,duplicates=0;
  for(const q of data.queries) {
    const w=data.wardrobes.find(w=>w.id===q.wardrobeId),possible=oracle(w,q);
    const out=fn(w,q),success=out.some(o=>acceptable(o,w,q));
    const keys=out.map(o=>o.map(i=>i.id).sort().join('|'));
    if(possible){eligible++;if(success)hits++;}else{impossible++;if(!out.length)abstained++;}
    returned+=out.length;owned+=out.filter(o=>o.every(i=>w.items.some(j=>j.id===i.id))).length;
    invalid+=out.filter(o=>!acceptable(o,w,q)).length;duplicates+=keys.length-new Set(keys).size;
    for(let warm=0;warm<5;warm++)fn(w,q);
    for(let repeat=0;repeat<30;repeat++){const start=performance.now();fn(w,q);times.push(performance.now()-start);}
    raw.push({method,queryId:q.id,scenario:w.scenario,possible,success,outfits:out.map(o=>o.map(i=>i.id)),valid:out.map(o=>acceptable(o,w,q))});
  }
  times.sort((a,b)=>a-b);
  summary[method]={queries:data.queries.length,eligible,top3Hits:hits,top3ConstraintSuccess:hits/eligible,impossible,correctAbstentions:abstained,returnedOutfits:returned,invalidOutfits:invalid,ownedOutfits:owned,duplicateSuggestions:duplicates,timingSamples:times.length,p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1]};
}
const stress=[];
for(const size of [50,100,200]) {
  const items=Array.from({length:size},(_,i)=>({id:`stress-${i}`,name:`Stress garment ${i}`,category:['Top','Bottom','Shoes','Outerwear'][i%4],tags:'Presentation day',wears:i%13}));
  const q={context:'Presentation day',requireLowUse:true};
  for(const [method,fn]of Object.entries(methods)) {
    for(let i=0;i<2;i++)fn({items},q);
    const times=[];
    for(let i=0;i<10;i++){const start=performance.now();fn({items},q);times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);stress.push({method,size,samples:10,p50Ms:times[4],p95Ms:times[9]});
  }
}
const result={experiment:'sprint3-outfit-feasibility-v1',generatedAt:new Date().toISOString(),datasetSha256:createHash('sha256').update(source).digest('hex'),environment:{node:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,ramGiB:Math.round(os.totalmem()/1024**3)},protocol:{warmupsPerQuery:5,timedRepeatsPerQuery:30,styleJudgment:'Constraint proxy only; no human preference ratings',timing:'Warm in-process CPU latency; no network, model inference, database, or image processing'},summary,stress,raw};
mkdirSync(new URL('./results/',import.meta.url),{recursive:true});
writeFileSync(new URL('./results/latest.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary,stress,environment:result.environment},null,2));
if(summary.prototype.top3ConstraintSuccess<.7 || summary.prototype.invalidOutfits || summary.prototype.correctAbstentions!==summary.prototype.impossible)process.exitCode=1;
