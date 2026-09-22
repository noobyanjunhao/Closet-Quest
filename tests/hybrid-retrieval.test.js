import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveWardrobe} from '../server/retrieval.js';
import {retrieveWardrobeHybrid} from '../server/hybrid-retrieval.js';
import {planOutfits} from '../server/outfit-plans.js';

const garment=(id,category,extra={})=>({id,category,wears:5,...extra});
const base=()=>[garment('top','Top',{name:'Plain shirt'}),garment('bottom','Bottom',{name:'Trousers'}),garment('shoes','Shoes',{name:'Sneakers'})];
const noRanker=()=>({scores:[],metadata:{active:false,enabled:false,denseFeaturesTrained:false}});
function fakeEmbeddings(extra={}) {
  return {cacheDir:null,dimensions:3,getModelIdentity:async()=>({digest:'test-only-digest'}),embedTexts:async texts=>texts.map(text=>text.startsWith('Instruct:')?[1,0,0]:text.includes('Cable-knit pullover')?[0.99,0.01,0]:[0.01,0.9,0.1]),rerankCandidates:noRanker,...extra};
}

test('RRF recalls a disjoint-vocabulary target when the injected dense encoder ranks it above lexical ties',async()=>{
  const items=[...base(),...Array.from({length:60},(_,index)=>garment(`shirt-${index}`,'Top',{name:'Formal dress shirt'})),garment('target','Top',{name:'Cable-knit pullover'})];
  const brief={request:'Something snug for indoor reading'};
  assert.ok(!retrieveWardrobe(items,brief).items.some(item=>item.id==='target'));
  const result=await retrieveWardrobeHybrid(items,brief,fakeEmbeddings());
  assert.ok(result.items.some(item=>item.id==='target'));
  const target=result.retrieval.items.find(item=>item.id==='target');
  assert.equal(target.lexicalRank,null);
  assert.equal(target.denseRank,1);
  assert.ok(target.denseScore>0.99);
  assert.equal(result.retrieval.fallback.active,false);
  assert.ok(result.items.length<=18);
});

test('generic category words cannot swamp the best dense match with arbitrary short-document ranks',async()=>{
  const items=[...base(),...Array.from({length:60},(_,index)=>garment(`shoe-${index}`,'Shoes',{name:'Flats'})),garment('target','Shoes',{name:'Rugged leather hiking boots with ankle support'})];
  const result=await retrieveWardrobeHybrid(items,{request:'Footwear for trekking over uneven ground'},fakeEmbeddings({embedTexts:async texts=>texts.map(text=>text.startsWith('Instruct:')||text.includes('hiking boots')?[1,0,0]:[0.1,0.9,0])}));
  const target=result.retrieval.items.find(item=>item.id==='target');
  assert.ok(target);
  assert.ok(target.bm25Score>0);
  assert.equal(target.denseRank,1);
  assert.equal(target.fusionLexicalRank,null);
  assert.ok(result.retrieval.fusion.genericLexicalIgnoredCount>=60);
});

test('dense ranking and optional learned blending cannot lose anchor, low-use or complete slots',async()=>{
  const items=[...base(),...Array.from({length:80},(_,index)=>garment(`extra-${index}`,'Outerwear',{name:'Cable-knit pullover'})),garment('anchor','Top'),garment('low','Bottom',{wears:0})];
  const result=await retrieveWardrobeHybrid(items,{request:'layers',anchorId:'anchor',requireLowUse:true},fakeEmbeddings({rerankCandidates:({candidates})=>({scores:candidates.map(candidate=>({id:candidate.id,score:candidate.id.startsWith('extra')?100:-100})),metadata:{active:true,enabled:true,denseFeaturesTrained:false}})}));
  assert.ok(result.items.some(item=>item.id==='anchor'));
  assert.ok(result.items.some(item=>item.id==='low'));
  assert.ok(planOutfits(result.items,{anchorId:'anchor',requireLowUse:true}).plans.length>0);
  assert.equal(result.retrieval.reranker.denseFeaturesTrained,false);
});

test('unreviewed and private fields do not reach embedding input; current corrections do',async()=>{
  const observed=[];
  const dependencies=fakeEmbeddings({embedTexts:async texts=>{observed.push(...texts);return texts.map(()=>[1,0,0]);}});
  const items=[...base(),garment('pending','Top',{name:'PENDING_PRIVATE',needsReview:true})];
  items[0].image='PRIVATE_PHOTO';items[0].name='Corrected saffron shirt';
  await retrieveWardrobeHybrid(items,{request:'daily'},dependencies);
  assert.ok(observed.some(text=>text.includes('Corrected saffron shirt')));
  assert.ok(!observed.join(' ').includes('PENDING_PRIVATE')&&!observed.join(' ').includes('PRIVATE_PHOTO'));
});

test('unavailable embeddings use an explicit lexical fallback without invented dense scores',async()=>{
  const result=await retrieveWardrobeHybrid(base(),{request:'Coffee'},fakeEmbeddings({getModelIdentity:async()=>{throw Object.assign(new Error('model missing'),{code:'EMBEDDING_MODEL_MISSING'});}}));
  assert.equal(result.retrieval.embedding.available,false);
  assert.equal(result.retrieval.fallback.active,true);
  assert.ok(result.retrieval.items.every(item=>!Object.hasOwn(item,'denseScore')));
  assert.deepEqual(result.items.map(item=>item.id),base().map(item=>item.id));
});

test('reranker failure keeps real dense retrieval active, and invented reranker IDs are ignored',async()=>{
  const failed=await retrieveWardrobeHybrid(base(),{request:'Coffee'},fakeEmbeddings({rerankCandidates:()=>{throw new Error('ranker failure');}}));
  assert.equal(failed.retrieval.fallback.active,false);
  assert.equal(failed.retrieval.embedding.available,true);
  assert.equal(failed.retrieval.reranker.active,false);
  const forged=await retrieveWardrobeHybrid(base(),{request:'Coffee'},fakeEmbeddings({rerankCandidates:()=>({scores:[{id:'invented',score:99}],metadata:{active:true}})}));
  assert.equal(forged.retrieval.reranker.active,false);
  assert.ok(forged.items.every(item=>item.id!=='invented'));
});

test('invalid requests and impossible slots fail before embedding, while cancellation never becomes fallback',async()=>{
  let calls=0;
  const dependencies=fakeEmbeddings({getModelIdentity:async()=>{calls++;return {digest:'x'};}});
  await assert.rejects(retrieveWardrobeHybrid(base().slice(0,2),{request:''},dependencies),{code:'NO_COMPLETE_OUTFIT'});
  await assert.rejects(retrieveWardrobeHybrid(base(),{request:'',anchorId:'missing'},dependencies),{code:'ANCHOR_NOT_FOUND'});
  assert.equal(calls,0);
  const controller=new AbortController();controller.abort();
  await assert.rejects(retrieveWardrobeHybrid(base(),{request:'',signal:controller.signal},dependencies),{name:'AbortError'});
});
