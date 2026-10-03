// Public sample assets only. Never reads or changes the personal browser wardrobe.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {alphaDemoState} from '../src/alpha-demo.js';
import {recognitionPatch,saveLook,recordWearToday,undoLastWear,migrateState} from '../src/wardrobe.js';
import {recommend} from '../server/recommendation.js';
import {completeQuest,quests} from '../src/logic.js';
const base='http://127.0.0.1:5173/api',checks=[];
async function request(path,body){const start=performance.now();const response=await fetch(`${base}/${path}`,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(65000)});return {status:response.status,ms:Math.round((performance.now()-start)*100)/100,data:await response.json()};}
async function check(name,kind,fn){const started=performance.now();try{const details=await fn();checks.push({name,kind,pass:true,ms:Math.round(performance.now()-started),...details});}catch(error){checks.push({name,kind,pass:false,error:error.message});process.exitCode=1;}}
const status=await request('status');
const state=alphaDemoState();const body={items:state.items,context:'Campus casual',request:'Relaxed campus layers',anchorId:'photo-knit',provider:'quick'};
await check('HTTP quick recommendation -> saved look -> wear -> reload -> undo','real HTTP + domain integration',async()=>{
 const response=await request('style',body);assert.equal(response.status,200);const outfit=response.data.data.outfits[0];assert.ok(outfit.itemIds.includes(body.anchorId));assert.ok(outfit.itemIds.every(id=>state.items.some(i=>i.id===id)));
 let next=saveLook(state,outfit.itemIds,{...outfit,context:body.context,engine:'quick'});next=recordWearToday(next,outfit.itemIds,{outfitId:next.savedOutfits[0].id});next=migrateState(JSON.parse(JSON.stringify(next)));assert.equal(next.savedOutfits.length,1);assert.equal(next.wearRecords.length,1);assert.equal(recordWearToday(next,[...outfit.itemIds].reverse()),next);assert.deepEqual(JSON.parse(JSON.stringify(undoLastWear(next).items)),state.items);
 const quest=quests.find(q=>q.id==='rediscover');const awarded=completeQuest(state,quest,outfit.itemIds.map(id=>state.items.find(i=>i.id===id)),body.context,{stylistSuggested:true});assert.equal(awarded.xp,50);assert.throws(()=>completeQuest(awarded,quest,outfit.itemIds.map(id=>state.items.find(i=>i.id===id)),body.context,{stylistSuggested:true}));
 return {httpMs:response.ms,outfitIds:outfit.itemIds,pipeline:response.data.pipeline,questXp:awarded.xp};
});
for(const [name,items] of [['empty wardrobe',[]],['missing footwear',state.items.filter(i=>i.category!=='Shoes')],['unreviewed anchor',state.items.map(i=>i.id===body.anchorId?{...i,needsReview:true}:i)]])await check(name,'real HTTP',async()=>{const r=await request('style',{...body,items});assert.ok(r.status>=400||r.data.data?.outfits?.length===0);return {httpStatus:r.status,httpMs:r.ms,error:r.data.error||r.data.data?.reason};});
for(const code of ['MODEL_TIMEOUT','MODEL_UNAVAILABLE'])await check(`${code} -> explicit quick fallback`,'injected provider failure; real retrieval/planning/validation',async()=>{const r=await recommend({...body,provider:'local'},{retrievalDependencies:{enabled:false},localChat:async()=>{throw Object.assign(new Error(code),{code,status:503});}});assert.equal(r.pipeline.provider,'quick');assert.equal(r.pipeline.fallback.code,code);assert.equal(r.pipeline.retrievalPasses,1);assert.ok(r.data.outfits.length);return {pipeline:r.pipeline};});
await check('corrupt and unsupported image payloads','real HTTP job queue',async()=>{
 const results=[];for(const image of ['data:image/gif;base64,YQ==','data:image/jpeg;base64,YQ==']){
  const r=await request('jobs',{image});if(r.status>=400){results.push({status:r.status,error:r.data.error});continue;}assert.equal(r.status,202);
  let j;for(let n=0;n<40;n++){j=await request(`jobs/${r.data.id}`);if(['ready','failed','cancelled'].includes(j.data.status))break;await new Promise(resolve=>setTimeout(resolve,100));}assert.equal(j.data.status,'failed');assert.equal(j.data.errorCode,'INVALID_IMAGE');results.push({status:j.data.status,code:j.data.errorCode});
 }return {results};
});
await check('recognition correction survives serialization','domain integration',async()=>{const patch=recognitionPatch({data:{name:'AI tee',category:'Top',color:'#fff',colorName:'White',occasions:['Presentation day'],styleTags:[]}});const corrected={...patch,name:'Reviewed tee',tags:'Campus casual',needsReview:false};const restored=JSON.parse(JSON.stringify(corrected));assert.equal(restored.tags,'Campus casual');return {correctedTags:restored.tags};});
const timing=[];for(let i=0;i<10;i++){const r=await request('style',body);assert.equal(r.status,200);timing.push(r.ms);}timing.sort((a,b)=>a-b);
await mkdir('output/sprint6',{recursive:true});const result={measuredAt:new Date().toISOString(),environment:'Windows localhost; public sample wardrobe; no cloud credentials',status:status.data,checks,quickHttp:{n:10,sortedMs:timing,medianMs:(timing[4]+timing[5])/2,maxMs:timing.at(-1)},scope:'Small development integration sample; not accuracy, population P95, or human fashion acceptance.'};
await writeFile('output/sprint6/integration-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,total:checks.length,quickHttp:result.quickHttp},null,2));

