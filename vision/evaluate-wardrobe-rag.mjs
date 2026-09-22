import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { newPhotoState } from '../src/wardrobe.js';
import { validateOutfits } from '../server/agents.js';

const endpoint='http://127.0.0.1:5173/api';
const items=newPhotoState().items.map(({image,photoKey,...item})=>item);
const cases=[
  {id:'coffee-knit-anchor',context:'Coffee date',request:'A relaxed look with earth tones and knit texture. Keep the starting sweater in every look.',anchorId:'photo-knit',requireLowUse:true},
  {id:'presentation-blazer-anchor',context:'Presentation day',request:'A polished, simple combination with tailored pieces and a restrained palette.',anchorId:'photo-blazer'},
];
const run={date:new Date().toISOString(),protocol:'Development integration check on authored metadata of the seven real-photo sample garments. Validates owned IDs, complete shapes, anchor inclusion, source facts and bounded context. Not a fashion-quality, retrieval-accuracy or user-preference study.',cases:[],retrievalChecks:[]};
async function post(path,body) {
  const start=performance.now();
  const response=await fetch(`${endpoint}/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(190000)});
  const data=await response.json();return {status:response.status,totalMs:Math.round(performance.now()-start),data};
}
for(const query of cases) {
  const {id,...body}=query;
  const response=await post('style',{items,...body});
  const record={id,query:body,...response};
  try {
    assert.equal(response.status,200);
    const result=response.data;
    assert.ok(result.data.outfits.length>0,'Model returned no valid outfits');
    assert.equal(validateOutfits(result.data,items,!!body.requireLowUse,body.anchorId).outfits.length,result.data.outfits.length);
    assert.ok(result.retrieval.contextBytes<=result.retrieval.contextLimitBytes);
    for(const outfit of result.data.outfits) {
      assert.deepEqual(outfit.grounding.map(g=>g.itemId),outfit.itemIds);
      assert.ok(outfit.guideCitations.every(c=>result.retrieval.guidance.some(g=>g.id===c.id)));
    }
    record.passed=true;
  }catch(error){record.passed=false;record.failure=error.message;process.exitCode=1;}
  run.cases.push(record);console.log(`${id}: ${record.passed?'PASS':'FAIL'}; ${response.totalMs}ms; ${response.data.data?.outfits.length||0} valid looks`);
}
const crowded=[...Array.from({length:180},(_,index)=>({id:`distractor-${index}`,name:`Black cotton tee ${index}`,category:'Top',colorName:'Black',tags:'Campus casual',wears:8})),...items];
const crowdedResult=await post('retrieve',{items:crowded,request:'Forest green cable knit sweater and sand trousers',context:'Coffee date',anchorId:'photo-knit'});
const crowdedPass=crowdedResult.status===200&&crowdedResult.data.retrieval.retrievedCount<=18&&['photo-knit','photo-trousers','photo-sneakers'].every(id=>crowdedResult.data.retrieval.items.some(item=>item.id===id));
run.retrievalChecks.push({id:'crowded-closet-187',passed:crowdedPass,...crowdedResult});
const missingShoes=await post('retrieve',{items:items.filter(i=>i.category!=='Shoes'),request:'Everyday look',context:'Campus casual'});
run.retrievalChecks.push({id:'missing-shoes',passed:missingShoes.status===400&&missingShoes.data.code==='NO_COMPLETE_OUTFIT',...missingShoes});
if(run.retrievalChecks.some(c=>!c.passed))process.exitCode=1;
run.summary={styleCasesPassed:run.cases.filter(c=>c.passed).length,styleCases:run.cases.length,retrievalChecksPassed:run.retrievalChecks.filter(c=>c.passed).length,retrievalChecks:run.retrievalChecks.length};
await fs.mkdir(new URL('./results/rag-runs/',import.meta.url),{recursive:true});
await fs.writeFile(new URL(`./results/rag-runs/${run.date.replace(/[:.]/g,'-')}.json`,import.meta.url),JSON.stringify(run,null,2)+'\n');
await fs.writeFile(new URL('./results/wardrobe-rag-development.json',import.meta.url),JSON.stringify(run,null,2)+'\n');
console.log(JSON.stringify(run.summary));
