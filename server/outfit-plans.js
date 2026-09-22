import { PipelineError } from './recognition.js';

export const PLANNING_VERSION='validated-outfit-plans-v1';
const categories=['Top','Bottom','Dress','Shoes','Outerwear','Accessory'];
const signature=ids=>JSON.stringify([...ids].sort());

function validCombination(items,anchorId,requireLowUse) {
  if(items.some(item=>item.needsReview)||new Set(items.map(item=>item.id)).size!==items.length)return false;
  const count=category=>items.filter(item=>item.category===category).length;
  return count('Shoes')===1 && count('Outerwear')<=1 && count('Accessory')<=2
    && ((count('Top')===1&&count('Bottom')===1&&count('Dress')===0)||(count('Dress')===1&&count('Top')===0&&count('Bottom')===0))
    && (!anchorId||items.some(item=>item.id===anchorId)) && (!requireLowUse||items.some(item=>item.wears<=1));
}
function similarity(left,right) {
  const rightIds=new Set(right.itemIds);
  const intersection=left.itemIds.filter(id=>rightIds.has(id)).length;
  return intersection/(left.itemIds.length+right.itemIds.length-intersection);
}

export function planOutfits(items,{anchorId=null,requireLowUse=false,scores=[]}={}) {
  const start=performance.now();
  if(!Array.isArray(items)||items.length>18||items.some(item=>!item||typeof item.id!=='string'||!categories.includes(item.category)||!Number.isFinite(item.wears)||item.wears<0)||new Set(items.map(item=>item.id)).size!==items.length) {
    throw new PipelineError('Outfit planning requires at most 18 unique wardrobe records.',{code:'INVALID_PLAN_INPUT',status:400});
  }
  const eligible=items.filter(item=>!item.needsReview);
  const groups=Object.fromEntries(categories.map(category=>[category,eligible.filter(item=>item.category===category)]));
  const itemScores=new Map(scores.map(entry=>[entry.id,Number.isFinite(entry.score)?Math.max(0,entry.score):0]));
  const bases=[];
  for(const top of groups.Top)for(const bottom of groups.Bottom)for(const shoes of groups.Shoes)bases.push([top,bottom,shoes]);
  for(const dress of groups.Dress)for(const shoes of groups.Shoes)bases.push([dress,shoes]);
  const pool=[];
  const seen=new Set();
  let enumeratedCount=0;
  const accessoryChoices=[[],...groups.Accessory.map(item=>[item])];
  const accessoryAnchor=groups.Accessory.find(item=>item.id===anchorId);
  // An owned accessory anchor can need a second accessory to satisfy rediscovery.
  // Enumerate only those required pairs, not every possible accessory pairing.
  if(requireLowUse&&accessoryAnchor&&accessoryAnchor.wears>1)for(const lowUse of groups.Accessory.filter(item=>item.wears<=1&&item.id!==anchorId))accessoryChoices.push([accessoryAnchor,lowUse]);
  for(const base of bases)for(const outerwear of [null,...groups.Outerwear])for(const accessories of accessoryChoices) {
    enumeratedCount++;
    const outfit=[...base,outerwear,...accessories].filter(Boolean);
    if(!validCombination(outfit,anchorId,requireLowUse))continue;
    const itemIds=outfit.map(item=>item.id);
    const key=signature(itemIds);
    if(seen.has(key))continue;
    seen.add(key);
    pool.push({itemIds,shape:base[0].category==='Dress'?'dress':'separates',score:outfit.reduce((sum,item)=>sum+(itemScores.get(item.id)||0),0)/Math.sqrt(outfit.length),order:pool.length});
  }
  // With 18 records, one outerwear and only required accessory pairs, enumeration stays small.
  // Use lexical relevance plus an overlap penalty to retain genuinely different combinations.
  const maximumScore=Math.max(1,...pool.map(plan=>plan.score));
  const remaining=[...pool];
  const selected=[];
  while(remaining.length&&selected.length<12) {
    let bestIndex=0,bestValue=-Infinity;
    const uncoveredShape=selected.length>0&&remaining.some(candidate=>!selected.some(previous=>previous.shape===candidate.shape));
    for(let index=0;index<remaining.length;index++) {
      const candidate=remaining[index];
      if(uncoveredShape&&selected.some(previous=>previous.shape===candidate.shape))continue;
      const overlap=selected.length?Math.max(...selected.map(previous=>similarity(candidate,previous))):0;
      const value=candidate.score/maximumScore-0.6*overlap;
      if(value>bestValue) { bestValue=value;bestIndex=index; }
    }
    selected.push(remaining.splice(bestIndex,1)[0]);
  }
  return {
    plans:selected.map((plan,index)=>({id:`P${index+1}`,itemIds:plan.itemIds,score:Number(plan.score.toFixed(4))})),
    planning:{version:PLANNING_VERSION,method:'Enumerated valid outfits + lexical relevance, base-shape coverage and overlap diversity',enumeratedCount,validCombinationCount:pool.length,candidateCount:selected.length,timingMs:Number((performance.now()-start).toFixed(2))},
  };
}

export function validatePlanSelections(value,plans) {
  if(!value||!Array.isArray(value.outfits)||typeof value.reason!=='string'||value.reason.length>2000)throw new Error('Invalid stylist response.');
  const seen=new Set();
  const selected=[];
  for(const outfit of value.outfits.slice(0,3)) {
    if(!outfit||typeof outfit.planId!=='string'||seen.has(outfit.planId)||!Object.entries({title:80,explanation:400,stylingTip:220}).every(([key,limit])=>typeof outfit[key]==='string'&&outfit[key].trim().length>0&&outfit[key].length<=limit))continue;
    const plan=plans.find(candidate=>candidate.id===outfit.planId);
    if(!plan)continue;
    seen.add(plan.id);
    selected.push({planId:plan.id,itemIds:[...plan.itemIds],title:outfit.title,explanation:outfit.explanation,stylingTip:outfit.stylingTip});
  }
  return {outfits:selected,reason:selected.length?value.reason:'The stylist did not choose a valid prepared outfit. Try another brief.',rejectedSelectionCount:value.outfits.length-selected.length};
}
