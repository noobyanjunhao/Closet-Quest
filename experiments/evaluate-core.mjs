import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { recommend as original } from './baseline-v1.js';
import { rankOutfits } from '../src/recommender.js';
import { recommend } from '../server/recommendation.js';

const source=await readFile(new URL('./data/wardrobes.json',import.meta.url));
const dataset=JSON.parse(source);
// Independent oracle: no production retrieval, planning or validation helpers.
function valid(ids,wardrobe,query) {
  const records=ids.map(id=>wardrobe.items.find(item=>item.id===id));
  if(!records.length||records.some(item=>!item||item.needsReview)||new Set(ids).size!==ids.length)return false;
  const count=category=>records.filter(item=>item.category===category).length;
  return count('Shoes')===1&&count('Outerwear')<=1&&count('Accessory')<=2&&
    ((count('Dress')===1&&!count('Top')&&!count('Bottom'))||(!count('Dress')&&count('Top')===1&&count('Bottom')===1))&&
    (!query.requireLowUse||records.some(item=>item.wears<=1));
}
function possible(wardrobe,query) {
  const group=category=>wardrobe.items.filter(item=>item.category===category&&!item.needsReview);
  const bases=[];
  for(const shoe of group('Shoes')){for(const dress of group('Dress'))bases.push([dress,shoe]);for(const top of group('Top'))for(const bottom of group('Bottom'))bases.push([top,bottom,shoe]);}
  for(const base of bases)for(const outer of [null,...group('Outerwear')])for(const accessory of [null,...group('Accessory')])if(valid([...base,outer,accessory].filter(Boolean).map(item=>item.id),wardrobe,query))return true;
  return false;
}
const methods={
  original_v1:async(w,q)=>[0,1,2].map(index=>original(w.items,q.context,index).map(item=>item.id)).filter(ids=>ids.length),
  assignment3:async(w,q)=>rankOutfits(w.items,q.context,{requireLowUse:q.requireLowUse}).outfits.map(look=>look.items.map(item=>item.id)),
  quick_rag_v2:async(w,q)=>{try{return(await recommend({...q,items:w.items,request:`An outfit for ${q.context}`,provider:'quick'})).data.outfits.map(look=>look.itemIds);}catch(error){if(['NO_COMPLETE_OUTFIT','NO_ELIGIBLE_ITEMS','NO_LOW_USE_ITEMS','INSUFFICIENT_WARDROBE','NO_REVIEWED_ITEMS','NO_VALID_LOW_USE_OUTFIT'].includes(error.code))return [];throw error;}},
};
const raw=[],summary={};
for(const [method,run] of Object.entries(methods)) {
  const times=[];let feasible=0,success=0,impossible=0,abstained=0,returned=0,invalid=0,owned=0,duplicate=0,occasionCompatible=0;
  for(const query of dataset.queries) {
    const wardrobe=dataset.wardrobes.find(w=>w.id===query.wardrobeId),can=possible(wardrobe,query);
    const started=performance.now();const outfits=await run(wardrobe,query);times.push(performance.now()-started);
    const checks=outfits.map(ids=>valid(ids,wardrobe,query));
    if(can){feasible++;if(checks.some(Boolean))success++;}else{impossible++;if(!outfits.length)abstained++;}
    returned+=outfits.length;invalid+=checks.filter(v=>!v).length;owned+=outfits.filter(ids=>ids.every(id=>wardrobe.items.some(item=>item.id===id))).length;
    duplicate+=outfits.length-new Set(outfits.map(ids=>[...ids].sort().join('|'))).size;
    occasionCompatible+=outfits.filter(ids=>ids.every(id=>wardrobe.items.find(item=>item.id===id)?.tags.split(',').some(tag=>tag.trim().toLowerCase()===query.context.toLowerCase()))).length;
    raw.push({method,queryId:query.id,scenario:wardrobe.scenario,possible:can,outfits,valid:checks});
  }
  times.sort((a,b)=>a-b);
  summary[method]={queries:dataset.queries.length,feasible,top3Success:success,impossible,correctAbstentions:abstained,returned,invalid,owned,duplicate,occasionCompatible,timingSamples:times.length,p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1]};
}
const result={experiment:'core-v2-common-constraints',date:new Date().toISOString(),datasetSha256:createHash('sha256').update(source).digest('hex'),environment:{node:process.version,cpu:os.cpus()[0].model,platform:process.platform},protocol:{dataset:'30 frozen synthetic wardrobes, 180 requests; reused development data, not held out.',oracle:'Owned, reviewed, unique, complete shapes and low-use constraints. Occasion is measured separately as exact tag compatibility; v2 treats it as soft preference, Assignment 3 treated it as hard.',timing:'One in-process sample per request, includes first-run initialization. Quick RAG uses BM25 and deterministic plans; no LLM or network. Not a cloud latency benchmark.',humanStyleQuality:'Not measured'},summary,raw};
await mkdir(new URL('./results/',import.meta.url),{recursive:true});await writeFile(new URL('./results/core-v2.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary,environment:result.environment},null,2));
if(summary.quick_rag_v2.invalid||summary.quick_rag_v2.correctAbstentions!==summary.quick_rag_v2.impossible)process.exitCode=1;
