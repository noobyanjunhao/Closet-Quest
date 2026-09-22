import test from 'node:test';
import assert from 'node:assert/strict';
import {planOutfits,validatePlanSelections} from '../server/outfit-plans.js';
import {validateOutfits,style as styleWithRetrieval} from '../server/agents.js';

const garment=(id,category,wears=5,extra={})=>({id,category,wears,...extra});
const wardrobe=()=>[
  garment('tee','Top'),garment('knit','Top',1),garment('denim','Bottom'),garment('trousers','Bottom',0),
  garment('sneakers','Shoes'),garment('blazer','Outerwear',0),garment('tote','Accessory'),
];
const selection=planId=>({planId,title:'Everyday layers',explanation:'A simple base with one layer.',stylingTip:'Use the recorded pieces together.'});
const asOutfit=plan=>({itemIds:plan.itemIds,title:'Candidate',explanation:'For structural validation only.',stylingTip:'Review this option.'});
const style=body=>styleWithRetrieval(body,{retrievalDependencies:{enabled:false}});

test('every presentation candidate already contains the blazer anchor and complete owned slots',()=>{
 const items=wardrobe();
 const {plans,planning}=planOutfits(items,{anchorId:'blazer',requireLowUse:true});
 assert.equal(plans.length,8);
 assert.equal(planning.validCombinationCount,8);
 for(const plan of plans) {
  assert.ok(plan.itemIds.includes('blazer'));
  assert.equal(validateOutfits({outfits:[asOutfit(plan)],reason:''},items,true,'blazer').outfits.length,1);
 }
 assert.equal(new Set(plans.map(plan=>JSON.stringify([...plan.itemIds].sort()))).size,plans.length);
});

test('18-record planning stays bounded and offers different bases instead of only accessory variants',()=>{
 const categories=['Top','Bottom','Shoes','Dress','Outerwear','Accessory'];
 const items=Array.from({length:18},(_,index)=>garment(`g${index}`,categories[index%6],index%4));
 const {plans,planning}=planOutfits(items,{scores:items.map(item=>({id:item.id,score:1}))});
 assert.equal(plans.length,12);
 assert.ok(planning.enumeratedCount<=2048);
 assert.ok(planning.validCombinationCount>plans.length);
 const bases=plans.map(plan=>JSON.stringify(plan.itemIds.filter(id=>['Top','Bottom','Dress'].includes(items.find(item=>item.id===id).category)).sort()));
 assert.ok(new Set(bases).size>=4);
 assert.ok(plans.some(plan=>plan.itemIds.some(id=>items.find(item=>item.id===id).category==='Dress')));
 for(const plan of plans)assert.equal(validateOutfits({outfits:[asOutfit(plan)],reason:''},items).outfits.length,1);
 assert.throws(()=>planOutfits([...items,garment('overflow','Accessory')]),{code:'INVALID_PLAN_INPUT'});
});

test('dress and top anchors cannot leak into the other base shape or borrow incompatible low-use pieces',()=>{
 const items=[...wardrobe().map(item=>({...item,wears:5})),garment('dress','Dress'),garment('low-top','Top',0)];
 assert.equal(planOutfits(items,{anchorId:'dress',requireLowUse:true}).plans.length,0);
 items.push(garment('low-shoes','Shoes',0));
 const dressPlans=planOutfits(items,{anchorId:'dress',requireLowUse:true}).plans;
 assert.ok(dressPlans.length>0);
 assert.ok(dressPlans.every(plan=>plan.itemIds.includes('dress')&&plan.itemIds.includes('low-shoes')&&!plan.itemIds.includes('low-top')));
 const topPlans=planOutfits(items,{anchorId:'tee'}).plans;
 assert.ok(topPlans.every(plan=>plan.itemIds.includes('tee')&&!plan.itemIds.includes('dress')));
});

test('an accessory anchor can keep a different low-use accessory when that is the only feasible rediscovery',()=>{
 const items=wardrobe().map(item=>({...item,wears:5}));
 items.push(garment('low-scarf','Accessory',0));
 const {plans}=planOutfits(items,{anchorId:'tote',requireLowUse:true});
 assert.ok(plans.length>0);
 for(const plan of plans) {
  assert.ok(plan.itemIds.includes('tote')&&plan.itemIds.includes('low-scarf'));
  assert.equal(validateOutfits({outfits:[asOutfit(plan)],reason:''},items,true,'tote').outfits.length,1);
 }
});

test('unreviewed items, missing shoes, and unknown anchors never produce a plan',()=>{
 assert.equal(planOutfits(wardrobe(),{anchorId:'invented'}).plans.length,0);
 assert.equal(planOutfits(wardrobe().map(item=>({...item,needsReview:item.id==='sneakers'}))).plans.length,0);
 assert.equal(planOutfits(wardrobe().filter(item=>item.category!=='Shoes')).plans.length,0);
 const result=planOutfits([...wardrobe(),garment('pending','Top',0,{needsReview:true})]);
 assert.ok(result.plans.every(plan=>!plan.itemIds.includes('pending')));
});

test('selection validation rejects invented plan IDs, duplicates and empty prose without a fallback',()=>{
 const {plans}=planOutfits(wardrobe(),{anchorId:'blazer'});
 const valid=validatePlanSelections({outfits:[selection(plans[0].id),selection(plans[1].id),selection(plans[2].id)],reason:''},plans);
 assert.deepEqual(valid.outfits.map(outfit=>outfit.itemIds),plans.slice(0,3).map(plan=>plan.itemIds));
 const mixed=validatePlanSelections({outfits:[selection('P999'),selection(plans[0].id),selection(plans[0].id)],reason:''},plans);
 assert.equal(mixed.outfits.length,1);
 assert.equal(mixed.rejectedSelectionCount,2);
 const rejected=validatePlanSelections({outfits:[{...selection('P999'),itemIds:['invented']},{...selection(plans[0].id),explanation:''}],reason:''},plans);
 assert.deepEqual(rejected.outfits,[]);
 assert.equal(rejected.rejectedSelectionCount,2);
});

test('stylist restores three distinct selected plans and never invents a fallback when all choices fail',async(t)=>{
 let invalid=false;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const input=JSON.parse(JSON.parse(options.body).messages[1].content);
  const chosen=invalid?[selection('not-a-plan')]:input.plans.slice(0,3).map(plan=>selection(plan.id));
  return {ok:true,json:async()=>({message:{content:JSON.stringify({outfits:chosen,reason:''})},eval_count:30})};
 });
 const request={items:wardrobe(),request:'Polished presentation',anchorId:'blazer'};
 const result=await style(request);
 assert.equal(result.data.outfits.length,3);
 assert.deepEqual(result.planning.selectedPlanIds,['P1','P2','P3']);
 assert.ok(result.data.outfits.every(outfit=>outfit.itemIds.includes('blazer')));
 assert.ok(result.data.outfits.every(outfit=>outfit.grounding.length===outfit.itemIds.length));
 invalid=true;
 const rejected=await style(request);
 assert.equal(rejected.data.outfits.length,0);
 assert.equal(rejected.planning.rejectedSelectionCount,1);
 assert.deepEqual(rejected.planning.selectedPlanIds,[]);
});
