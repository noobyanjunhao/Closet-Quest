import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStylistRoute} from '../server/stylist-orchestrator.js';
import {recommend,quickChat} from '../server/recommendation.js';
import {retrieveWardrobeHybrid} from '../server/hybrid-retrieval.js';
const items=[['top','Top'],['bottom','Bottom'],['shoes','Shoes']].map(([id,category])=>({id,category,name:id,color:'#888888',wears:0}));
const body={items,context:'Campus casual',request:'Style me',provider:'openai',preferences:{modelProfile:'fast'}};
const lexical=(i,o)=>retrieveWardrobeHybrid(i,o,{enabled:false});
const personal={request:'Style me',preferences:{modelProfile:'fast',notes:''},history:[]};

test('routine automatic requests skip the model; personal, explicit and study requests retain it',()=>{
  const input={availableProvider:'openai',personal};
  assert.equal(selectStylistRoute(input).provider,'quick');
  for(const patch of [{requestedProvider:'openai'},{personal:{...personal,request:'A formal wedding in November'}},{personal:{...personal,preferences:{...personal.preferences,notes:'Keep shoulders covered'}}},{personal:{...personal,history:[{feedback:'helpful'}]}},{studyCondition:'full'}])assert.equal(selectStylistRoute({...input,...patch}).provider,'openai');
});
test('server offline policy overrides explicit deep model choice and prevents embedding/generation calls',async()=>{
  let generated=0,embedded=0;
  const result=await recommend({...body,preferences:{modelProfile:'deep',embeddingProvider:'openai'}},{policy:'offline',openaiChat:async()=>{generated++;},retrievalDependencies:{embeddingClient:{embed:async()=>{embedded++;throw Error('must not run');}}}});
  assert.equal(generated,0);assert.equal(embedded,0);assert.equal(result.pipeline.provider,'quick');assert.equal(result.pipeline.orchestration.reason,'server-offline-policy');assert.ok(result.data.outfits.length);
  await assert.rejects(recommend(body,{policy:'offlne'}),e=>e.code==='INVALID_STYLIST_POLICY');
});
test('bounded specialist fallback retains ownership and safe trace, with one model attempt',async()=>{
  let calls=0;
  const result=await recommend({...body,request:'PRIVATE BRIEF wedding',preferences:{notes:'PRIVATE NOTE'}},{retrieve:lexical,openaiChat:async()=>{calls++;return {data:{outfits:[{planId:'foreign-plan',title:'invented',explanation:'bad',stylingTip:'bad'}],reason:'bad'}};}});
  assert.equal(calls,1);assert.equal(result.pipeline.provider,'quick');assert.ok(result.pipeline.fallback);
  assert.ok(result.data.outfits.every(o=>o.itemIds.every(id=>items.some(i=>i.id===id))));
  assert.ok(!JSON.stringify(result.pipeline.orchestration).includes('PRIVATE'));
  assert.equal(result.pipeline.orchestration.stages.find(s=>s.specialist==='style-selector').status,'fallback');
});
test('timeout degrades once; cancellation never launches a replacement model',async()=>{
  const result=await recommend(body,{retrieve:lexical,openaiChat:()=>new Promise(()=>{}),budgets:{generationMs:5}});
  assert.equal(result.pipeline.fallback.code,'STYLING_TIMEOUT');assert.equal(result.pipeline.orchestration.generationAttempts,1);
  const controller=new AbortController();controller.abort();let called=0;
  await assert.rejects(recommend(body,{signal:controller.signal,openaiChat:async()=>{called++;}}));assert.equal(called,0);
});
test('explicit richer brief gets owned plans with an accurate completed selector trace',async()=>{
  const result=await recommend({...body,request:'I am going to a wedding, something formal'},{retrieve:lexical,openaiChat:quickChat});
  assert.equal(result.pipeline.provider,'openai');assert.equal(result.pipeline.orchestration.stages.at(-1).returnedOutfits,result.data.outfits.length);
  assert.equal(result.pipeline.orchestration.generationAttempts,1);
});
