import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOutfits,validateGarment,style as styleWithRetrieval,STYLE_CONTEXT_BUDGET_BYTES} from '../server/agents.js';
import {initialState,completeQuest,quests} from '../src/logic.js';
const items=[{id:'t',category:'Top',wears:4},{id:'b',category:'Bottom',wears:0},{id:'s',category:'Shoes',wears:2}];
const outfit=itemIds=>({itemIds,title:'Fresh',explanation:'Color contrast',stylingTip:'Tuck the shirt'});
const selection=planId=>({planId,title:'Fresh',explanation:'Color contrast',stylingTip:'Tuck the shirt'});
const style=(body,options={})=>styleWithRetrieval(body,{...options,retrievalDependencies:{enabled:false}});
test('agent guard rejects invented IDs, partial outfits and duplicates',()=>{
 const result=validateOutfits({outfits:[outfit(['t','b','fake']),outfit(['t','s']),outfit(['t','t','s'])],reason:''},items);
 assert.equal(result.outfits.length,0);
});
test('agent accepts owned combination without exact occasion tags and deduplicates',()=>{
 const result=validateOutfits({outfits:[outfit(['t','b','s']),outfit(['s','t','b'])],reason:''},items,true);
 assert.equal(result.outfits.length,1);
 assert.equal(validateOutfits({outfits:[outfit(['t','b','s'])],reason:''},items.map(i=>({...i,wears:5})),true).outfits.length,0);
});
test('recognition rejects non-garments and malformed color/category',()=>{
 assert.throws(()=>validateGarment({isGarment:false}));
 assert.throws(()=>validateGarment({isGarment:true,category:'Top',color:'red'}));
});
test('stylist quest accepts inferred context but still enforces ownership and low use',()=>{
 const state=initialState();const outfit=[state.items[3],state.items[4],state.items[2]];
 assert.throws(()=>completeQuest(state,quests[0],outfit,'Campus casual'));
 assert.equal(completeQuest(state,quests[0],outfit,'Campus casual',{stylistSuggested:true}).xp,50);
 assert.throws(()=>completeQuest(state,quests[0],[...outfit,{id:'fake'}],'Campus casual',{stylistSuggested:true}));
 assert.throws(()=>completeQuest(state,quests[0],[state.items[0],state.items[1],state.items[2]],'Campus casual',{stylistSuggested:true}));
});
test('model aliases map back to original wardrobe IDs',async(t)=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const payload=JSON.parse(options.body); const input=JSON.parse(payload.messages[1].content);
  assert.deepEqual(input.items.map(i=>i.id),['G1','G2','G3']);
  assert.deepEqual(input.plans[0].itemIds,['G1','G2','G3']);
  assert.deepEqual(payload.format.properties.outfits.items.properties.planId.enum,input.plans.map(plan=>plan.id));
  return {ok:true,json:async()=>({message:{content:JSON.stringify({outfits:[selection(input.plans[0].id)],reason:''})},eval_count:20})};
 });
 const result=await style({items,request:'Coffee date'});
 assert.deepEqual(result.data.outfits[0].itemIds,['t','b','s']);
 assert.deepEqual(result.data.outfits[0].grounding.map(item=>item.itemId),['t','b','s']);
 assert.ok(result.data.outfits[0].guideCitations.some(guide=>guide.id==='CQ-G01'));
});

test('stylist sends only reviewed retrieval context and enforces the anchor on generated outfits',async(t)=>{
 const wardrobe=[...items,{id:'anchor',category:'Top',wears:0,name:'Green sweater'},{id:'pending',category:'Dress',wears:0,needsReview:true,name:'PENDING-PRIVATE'}];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const payload=JSON.parse(options.body); const input=JSON.parse(payload.messages[1].content);
  assert.equal(input.anchorId,'G4');
  assert.equal(input.context,'Coffee date');
  assert.ok(!options.body.includes('PENDING-PRIVATE'));
  assert.ok(input.guidance.length>0);
  assert.ok(input.plans.every(plan=>plan.itemIds.includes('G4')));
  return {ok:true,json:async()=>({message:{content:JSON.stringify({outfits:[selection('P999'),{...selection(input.plans[0].id),itemIds:['G1'],grounding:'fabricated',guideCitations:[{id:'INVENTED'}]}],reason:''})},eval_count:20})};
 });
 const result=await style({items:wardrobe,request:'Style this piece',context:'Coffee date',anchorId:'anchor',requireLowUse:true});
 assert.equal(result.data.outfits.length,1);
 assert.deepEqual(result.data.outfits[0].itemIds,['anchor','b','s']);
 assert.equal(result.retrieval.excludedReviewCount,1);
 assert.ok(Array.isArray(result.data.outfits[0].grounding));
 assert.ok(!JSON.stringify(result.data.outfits[0]).includes('INVENTED'));
 assert.equal(result.planning.rejectedSelectionCount,1);
 assert.deepEqual(result.planning.selectedPlanIds,['P1']);
});

test('stylist rejects impossible requests before contacting the model',async(t)=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Must not infer');});
 await assert.rejects(style({items:items.slice(0,2),request:'Coffee'}),{code:'NO_COMPLETE_OUTFIT'});
 await assert.rejects(style({items,request:'Coffee',anchorId:'unknown'}),{code:'ANCHOR_NOT_FOUND'});
 assert.equal(calls,0);
});

test('output validation never accepts mixed dress and separates, unreviewed garments or missing anchors',()=>{
 const wardrobe=[...items,{id:'dress',category:'Dress',wears:0},{id:'pending',category:'Top',wears:0,needsReview:true}];
 const invalid=[null,outfit(['dress','t','b','s']),outfit(['pending','b','s']),outfit(['t','b','s'])];
 assert.equal(validateOutfits({outfits:invalid,reason:''},wardrobe,false,'dress').outfits.length,0);
 assert.equal(validateOutfits({outfits:[outfit(['dress','s'])],reason:''},wardrobe,false,'dress').outfits.length,1);
});

test('prompt packing bounds adversarial metadata without dropping anchor, slots, brief or full UI facts',async(t)=>{
 const categories=['Top','Bottom','Shoes','Dress','Outerwear','Accessory'];
 const longText='雪'.repeat(500);
 const longTags=Array.from({length:20},()=>('"\n\\').repeat(53)+'x');
 const wardrobe=Array.from({length:200},(_,index)=>({id:`item-${index}`,category:categories[index%6],wears:index===199?0:5,name:longText,color:'#abcdef',colorName:longText,pattern:longText,fit:longText,materialAppearance:longText,itemType:longText,tags:longTags,styleTags:longTags,occasions:longTags}));
 const request='Build a polished blue outfit around my starting piece; retain the rediscovery constraint.';
 let measuredBytes=0,measuredChars=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const payload=JSON.parse(options.body);const input=JSON.parse(payload.messages[1].content);
  measuredBytes=payload.messages.reduce((sum,message)=>sum+Buffer.byteLength(message.content,'utf8'),0);
  measuredChars=payload.messages.reduce((sum,message)=>sum+message.content.length,0);
  assert.ok(measuredBytes<=STYLE_CONTEXT_BUDGET_BYTES);
  assert.equal(input.items.length,18);
  assert.equal(input.request,request);
  assert.equal(input.context,'Presentation day');
  assert.equal(input.requireLowUse,true);
  assert.equal(input.metadataTruncated,true);
  assert.ok(payload.messages[0].content.includes('optional wardrobe text was shortened or omitted'));
  const anchor=input.items.find(item=>item.id===input.anchorId);
  assert.equal(anchor.category,'Bottom');
  assert.equal(anchor.wears,0);
  assert.ok(input.guidance.every(guide=>guide.text.length>100));
  assert.ok(input.plans.length>0&&input.plans.length<=12);
  assert.ok(input.plans.every(plan=>plan.itemIds.includes(input.anchorId)));
  return {ok:true,json:async()=>({message:{content:JSON.stringify({outfits:[selection(input.plans[0].id)],reason:''})},eval_count:20})};
 });
 const result=await style({items:wardrobe,request,context:'Presentation day',anchorId:'item-199',requireLowUse:true});
 assert.equal(result.retrieval.contextBytes,measuredBytes);
 assert.equal(result.retrieval.contextChars,measuredChars);
 assert.equal(result.retrieval.contextLimitBytes,6000);
 assert.ok(result.retrieval.truncatedFields.some(entry=>entry.itemId==='item-199'&&entry.field==='materialAppearance'));
 assert.ok(result.data.outfits[0].itemIds.includes('item-199'));
 const facts=result.data.outfits[0].grounding.find(entry=>entry.itemId==='item-199').facts;
 assert.ok(facts.includes(`Material appearance (unverified): ${longText}`));
});

test('oversized instruction text fails clearly rather than silently clipping the brief',async(t)=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Must not infer');});
 await assert.rejects(style({items,request:'雪'.repeat(2000)}),{code:'STYLE_CONTEXT_TOO_LARGE',status:400});
 assert.equal(calls,0);
});
