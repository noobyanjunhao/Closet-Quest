import { readFileSync } from 'node:fs';

export const FEATURE_VERSION='wardrobe-ranker-features-v1';
export const FEATURE_NAMES=['lexicalReciprocalRank','denseReciprocalRank','contextTagMatch','briefOverlap','colorMatch','categoryMatch','rediscoveryMatch','anchorMatch'];
const modelPath=new URL('../ml/artifacts/ranker.json',import.meta.url);
const tokens=value=>new Set(String(value||'').toLowerCase().match(/[a-z0-9]+/g)||[]);
const categories={Top:['top','shirt','tee','sweater','blouse'],Bottom:['bottom','pants','trousers','jeans','skirt'],Dress:['dress','jumpsuit'],Shoes:['shoes','sneakers','boots','footwear','loafers'],Outerwear:['outerwear','jacket','coat','blazer','cardigan'],Accessory:['accessory','bag','tote','scarf','hat','belt']};
const colors=['black','white','gray','grey','blue','navy','green','red','pink','yellow','orange','purple','beige','cream','brown'];
export function rankingFeatures(item,candidate,{request='',context='',requireLowUse=false,anchorId=null}={}) {
  const brief=tokens(request),document=tokens([item.name,item.itemType,item.category,item.colorName,item.fit,item.pattern,item.tags].join(' '));
  const meaningful=[...brief].filter(word=>!['a','an','the','for','with','and','my','i','to','of','in','this','outfit','look','choose','find','owned'].includes(word));
  const tags=(Array.isArray(item.tags)?item.tags:String(item.tags||'').split(',')).map(tag=>tag.trim().toLowerCase());
  const requestedColors=colors.filter(color=>brief.has(color));
  return [candidate.lexicalRank>0?1/candidate.lexicalRank:0,candidate.denseScore!==null&&candidate.denseScore!==undefined&&candidate.denseRank>0?1/candidate.denseRank:0,
    context&&tags.includes(context.toLowerCase().trim())?1:0,meaningful.length?meaningful.filter(word=>document.has(word)).length/meaningful.length:0,
    requestedColors.length&&requestedColors.some(color=>tokens(item.colorName).has(color))?1:0,
    (categories[item.category]||[]).some(word=>brief.has(word))?1:0,requireLowUse&&item.wears<=1?1:0,anchorId===item.id?1:0];
}
export const scoreFeatures=(features,weights)=>features.reduce((score,value,index)=>score+value*weights[index],0);
export function loadRanker() {try{return JSON.parse(readFileSync(modelPath,'utf8'));}catch{return null;}}
export function validRanker(model) {
  return model?.featureVersion===FEATURE_VERSION&&JSON.stringify(model.featureNames)===JSON.stringify(FEATURE_NAMES)&&Array.isArray(model.weights)&&model.weights.length===FEATURE_NAMES.length&&model.weights.every(Number.isFinite)
    &&model.activation?.passed===true&&model.activation?.minimumGain>0&&['validation','test'].every(split=>model.metrics?.[split]?.gain>=model.activation.minimumGain&&model.metrics[split].trained.pairAccuracy>=model.metrics[split].baseline.pairAccuracy);
}
export function rerankCandidates({items,candidates,request,context,anchorId,requireLowUse},{model=loadRanker(),enabled=process.env.CLOSET_LEARNED_RERANKER==='1'}={}) {
  const proxyGatePassed=validRanker(model),active=enabled&&proxyGatePassed,byId=new Map(items.map(item=>[item.id,item]));
  return {scores:candidates.map(candidate=>({id:candidate.id,score:active&&byId.has(candidate.id)?scoreFeatures(rankingFeatures(byId.get(candidate.id),candidate,{request,context,anchorId,requireLowUse}),model.weights):candidate.rrfScore||0})),
    metadata:{active,enabled,proxyGatePassed,modelVersion:model?.version||null,featureVersion:FEATURE_VERSION,trainingDomain:model?.trainingDomain||null,denseFeaturesTrained:model?.denseFeaturesTrained===true,reason:active?'Explicitly enabled experimental model; passed only a synthetic development proxy gate. Real and hybrid relevance remain unmeasured.':proxyGatePassed?'Trained development model available; live reranking is off until explicitly enabled.':'No model has passed the held-out activation gate.'}};
}
