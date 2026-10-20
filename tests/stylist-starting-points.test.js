import test from 'node:test';
import assert from 'node:assert/strict';
import {recommend,quickChat} from '../server/recommendation.js';
import {retrieveWardrobe} from '../server/retrieval.js';
import {saveLook} from '../src/wardrobe.js';
const item=(id,category,name=id,extra={})=>({id,category,name,wears:0,...extra});
const body={provider:'quick',context:'Campus casual',request:'im going to wedding give me somthing formlal'};
const lexical=async(items,options)=>retrieveWardrobe(items,options);
const run=(items,extra={},deps={})=>recommend({...body,items,...extra},{retrieve:lexical,...deps});

test('wedding brief with a single tee returns owned starting point and honest shopping placeholders',async()=>{
  const result=await run([item('tee','Top','Graphic tee')]);
  const look=result.data.outfits[0];
  assert.equal(look.occasion,'Wedding');
  assert.deepEqual(look.itemIds,['tee']);
  assert.equal(look.lookType,'starting-point');
  assert.deepEqual(look.missingCategories,['Bottom','Shoes']);
  assert.match(look.explanation,/Graphic tee/);
  assert.match(look.explanation,/dress code/);
  assert.ok(look.shoppingSuggestions.some(i=>i.category==='Top'&&i.kind==='dress-code-upgrade'));
  assert.ok(look.shoppingSuggestions.every(i=>i.owned===false&&i.status==='placeholder'&&i.url===null));
});
test('empty, unreviewed and excluded closets still get useful advice without claiming ownership',async()=>{
  for(const [items,extra] of [
    [[],{}],[[item('pending','Dress','Dress',{needsReview:true})],{}],
    [[item('red','Top','Red top',{colorName:'Red'})],{preferences:{avoidColors:['Red']}}],
  ]){
    const result=await run(items,extra);
    assert.ok(result.data.outfits.length);
    assert.deepEqual(result.data.outfits[0].itemIds,[]);
    assert.equal(result.data.outfits[0].shoppingSuggestions.length,3);
  }
});
test('complete casual closet stays owned and gains dressier swap ideas for a wedding',async()=>{
  const items=[item('tee','Top','Graphic tee'),item('jeans','Bottom','Blue jeans'),item('shoes','Shoes','White sneakers')];
  const {data}=await run(items);
  assert.equal(data.outfits[0].lookType,'owned-look');
  assert.deepEqual(new Set(data.outfits[0].itemIds),new Set(items.map(i=>i.id)));
  assert.equal(data.outfits[0].shoppingSuggestions.length,3);
  assert.ok(data.outfits[0].shoppingSuggestions.every(s=>s.kind==='dress-code-upgrade'));
});
test('partial planning preserves anchors, excludes unreviewed records, and supports dresses without shoes',async()=>{
  const {data}=await run([item('dress','Dress'),item('hat','Accessory'),item('bad','Shoes','bad',{needsReview:true})],{anchorId:'hat'});
  assert.ok(data.outfits.every(o=>o.itemIds.includes('hat')&&o.itemIds.includes('dress')&&!o.itemIds.includes('bad')));
  assert.deepEqual(data.outfits[0].missingCategories,['Shoes']);
});
test('model abstention falls back to a useful partial look',async()=>{
  const result=await run([item('top','Top')],{provider:'openai'},{openaiChat:async()=>({data:{outfits:[],reason:'Not enough clothes'}})});
  assert.equal(result.pipeline.provider,'quick');
  assert.equal(result.pipeline.fallback.code,'EMPTY_PLAN_SELECTION');
  assert.deepEqual(result.data.outfits[0].itemIds,['top']);
});
test('retrieval and documents start together; ignored provider deadlines still return a useful look',async()=>{
  let retrievalStarted=false,knowledgeStarted=false,generationAborted=false;
  const result=await run([item('top','Top')],{provider:'openai',wardrobeId:'test'},{
    budgets:{retrievalMs:15,knowledgeMs:15,generationMs:15},
    retrieve:async()=>{retrievalStarted=true;return new Promise(()=>{});},
    knowledgeSearch:async()=>{knowledgeStarted=true;assert.ok(retrievalStarted);return new Promise(()=>{});},
    openaiChat:async(_s,_p,_c,_i,{signal})=>{signal.addEventListener('abort',()=>{generationAborted=true;});return new Promise(()=>{});},
  });
  assert.ok(knowledgeStarted&&generationAborted);
  assert.equal(result.retrieval.fallback.code,'RETRIEVAL_TIMEOUT');
  assert.equal(result.retrieval.knowledge.metadata.mode,'unavailable');
  assert.equal(result.pipeline.fallback.code,'STYLING_TIMEOUT');
  assert.ok(result.pipeline.timingMs.total<1000);
  assert.ok(result.data.outfits.length);
});
test('user cancellation interrupts stalled work and never turns into a recommendation',async()=>{
  const controller=new AbortController();
  const pending=run([item('top','Top')],{provider:'openai'},{signal:controller.signal,retrieve:async()=>new Promise(()=>{})});
  controller.abort(new Error('cancelled by user'));
  await assert.rejects(pending,/cancelled by user/);
});
test('a starting point saves only reviewed owned pieces and retains missing-piece suggestions',async()=>{
  const items=[item('tee','Top','Tee')], result=await run(items),look=result.data.outfits[0];
  const saved=saveLook({items,savedOutfits:[]},look.itemIds,{...look,context:look.occasion});
  assert.deepEqual(saved.savedOutfits[0].itemIds,['tee']);
  assert.equal(saved.savedOutfits[0].lookType,'starting-point');
  assert.equal(saved.savedOutfits[0].shoppingSuggestions.length,3);
  assert.throws(()=>saveLook({items,savedOutfits:[]},['invented'],{...look}));
  assert.throws(()=>saveLook({items,savedOutfits:[]},[],{...look}));
});
test('real prompt requests a relaxed paragraph with transparent missing items and an owned plan',async()=>{
  let prompt;
  const result=await run([item('top','Top','Silk-look blouse')],{provider:'openai'},{openaiChat:async(...args)=>{prompt=args[1];return quickChat(...args);}});
  assert.match(prompt,/friendly working stylist/);
  assert.match(prompt,/Never return empty/);
  assert.equal(result.pipeline.provider,'openai');
  assert.equal(result.data.outfits[0].itemIds[0],'top');
});
