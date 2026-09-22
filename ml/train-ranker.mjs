import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {FEATURE_VERSION,FEATURE_NAMES,rankingFeatures,scoreFeatures} from '../server/reranker.js';
import {lexicalCandidates} from '../server/retrieval.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contexts=['Campus casual','Coffee date','Presentation day'];
const briefTemplates={train:(category,context)=>`Choose a ${category.toLowerCase()} for ${context.toLowerCase()}.`,validation:(category,context)=>`Find a ${category.toLowerCase()} option that fits ${context.toLowerCase()}.`,test:(category,context)=>`Which owned ${category.toLowerCase()} suits a ${context.toLowerCase()} plan?`};
export function buildRankingDataset(source) {
  // Fingerprint excludes only arbitrary IDs and wear counts. Case/spacing variants share a family.
  const fingerprint=items=>hash(items.map(({id,wears,...item})=>({...item,tags:String(item.tags||'').toLowerCase().split(',').map(x=>x.trim()).sort()})).sort((a,b)=>a.name.localeCompare(b.name)));
  const families=new Map();
  for(const wardrobe of source.wardrobes){const key=fingerprint(wardrobe.items);if(!families.has(key))families.set(key,[]);families.get(key).push(wardrobe);}
  const rows=[];
  for(const [family,wardrobes] of families) {
    const scenarios=wardrobes.map(w=>w.scenario);
    // Protocol fixed before training: hold out distinct wardrobe structures, not random item rows.
    const split=scenarios.includes('dress-only')?'validation':scenarios.some(s=>['dress-alternative','missing-shoes','mislabeled'].includes(s))?'test':'train';
    for(const wardrobe of wardrobes)for(const context of contexts)for(const category of ['Top','Bottom','Dress','Shoes','Outerwear','Accessory'])for(const requireLowUse of [false,true]) {
      const request=briefTemplates[split](category,context);
      const candidates=lexicalCandidates(wardrobe.items,{request,context}).map(candidate=>({...candidate,denseScore:null,denseRank:null,rrfScore:candidate.lexicalRank>0?1/(60+candidate.lexicalRank):0}));
      const judged=candidates.map(candidate=>{
        const item=wardrobe.items.find(i=>i.id===candidate.id);
        // Declared proxy judgment, not fashion taste: matching occasion, requested category, rediscovery.
        const contextMatch=item.tags.split(',').some(tag=>tag.trim().toLowerCase()===context.toLowerCase());
        const relevance=2*Number(contextMatch)+Number(item.category===category)+(requireLowUse&&item.wears<=1?0.5:0);
        return {id:item.id,features:rankingFeatures(item,candidate,{request,context,requireLowUse}),relevance,baseline:candidate.rrfScore};
      });
      rows.push({id:`${wardrobe.id}/${context}/${category}/${requireLowUse}`,wardrobeId:wardrobe.id,family,briefFamily:split,request,split,candidates:judged});
    }
  }
  for(const key of ['family','wardrobeId','request'])for(const a of ['train','validation','test'])for(const b of ['train','validation','test'])if(a<b) {
    const left=new Set(rows.filter(row=>row.split===a).map(row=>row[key]));
    if(rows.some(row=>row.split===b&&left.has(row[key])))throw new Error(`Split leakage: ${key}`);
  }
  return {schemaVersion:1,provenance:'Deterministic authored Sprint 3 wardrobe fixtures and explicit synthetic relevance proxy judgments. No real users or human taste labels.',judgment:'2 × saved occasion match + 1 × requested category match + 0.5 × low-use match when requested',splitProtocol:'Grouped by normalized wardrobe content; repeated variants and identical catalog families stay together. Brief templates are distinct per split. Catalog item types can recur; this is not independent fashion-quality evidence.',rows};
}
export function evaluateRanking(rows,weights=null) {
  let ndcg=0,pairs=0,correct=0,queries=0;
  for(const row of rows) {
    const scored=row.candidates.map(candidate=>({...candidate,score:weights?scoreFeatures(candidate.features,weights):candidate.baseline}));
    const dcg=list=>list.slice(0,5).reduce((sum,item,index)=>sum+(2**item.relevance-1)/Math.log2(index+2),0);
    const ideal=dcg([...scored].sort((a,b)=>b.relevance-a.relevance));
    if(!ideal)continue;
    ndcg+=dcg([...scored].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)))/ideal;queries++;
    for(let a=0;a<scored.length;a++)for(let b=a+1;b<scored.length;b++)if(scored[a].relevance!==scored[b].relevance){pairs++;const product=(scored[a].relevance-scored[b].relevance)*(scored[a].score-scored[b].score);correct+=product>0?1:product===0?0.5:0;}
  }
  return {queries,ndcgAt5:queries?ndcg/queries:0,pairAccuracy:pairs?correct/pairs:0,pairs};
}
export function trainPairwise(rows,{epochs=120,learningRate=0.2,l2=0.001}={}) {
  const weights=FEATURE_NAMES.map(()=>0),pairs=[];
  for(const row of rows)for(let a=0;a<row.candidates.length;a++)for(let b=a+1;b<row.candidates.length;b++) {
    const left=row.candidates[a],right=row.candidates[b];if(left.relevance===right.relevance)continue;
    const sign=left.relevance>right.relevance?1:-1;pairs.push(left.features.map((value,index)=>sign*(value-right.features[index])));
  }
  if(!pairs.length)throw new Error('Training needs judged preference pairs.');
  for(let epoch=0;epoch<epochs;epoch++) {
    const gradient=weights.map(weight=>l2*weight);
    for(const difference of pairs){const factor=1/(1+Math.exp(Math.max(-40,Math.min(40,scoreFeatures(difference,weights)))));difference.forEach((value,index)=>gradient[index]-=factor*value/pairs.length);}
    weights.forEach((_,index)=>weights[index]-=learningRate*gradient[index]);
  }
  return {weights,pairCount:pairs.length};
}
export function trainRanker(source) {
  const dataset=buildRankingDataset(source),part=split=>dataset.rows.filter(row=>row.split===split);
  // Select regularization using validation only; test is evaluated once after this selection.
  const trials=[0.001,0.01,0.1].map(l2=>{const fitted=trainPairwise(part('train'),{l2});return {...fitted,l2,validation:evaluateRanking(part('validation'),fitted.weights)};});
  trials.sort((a,b)=>b.validation.ndcgAt5-a.validation.ndcgAt5||a.l2-b.l2);
  const best=trials[0],metrics={};
  for(const split of ['train','validation','test']){const baseline=evaluateRanking(part(split)),trained=evaluateRanking(part(split),best.weights);metrics[split]={baseline,trained,gain:trained.ndcgAt5-baseline.ndcgAt5};}
  const minimumGain=0.01,passed=['validation','test'].every(split=>metrics[split].gain>=minimumGain&&metrics[split].trained.pairAccuracy>=metrics[split].baseline.pairAccuracy);
  const artifact={version:'pairwise-linear-development-v1',featureVersion:FEATURE_VERSION,featureNames:FEATURE_NAMES,weights:best.weights,trainingDomain:'synthetic-development-proxy',denseFeaturesTrained:false,datasetSha256:hash(dataset),sourceSha256:hash(source),training:{algorithm:'Full-batch pairwise logistic loss + L2',epochs:120,learningRate:0.2,l2:best.l2,pairCount:best.pairCount},activation:{passed,minimumGain,criterion:'Validation and test NDCG@5 improve by at least 0.01, and pair accuracy does not regress. This gate covers only the declared development proxy.'},metrics,splits:Object.fromEntries(['train','validation','test'].map(split=>[split,{queries:part(split).length,families:[...new Set(part(split).map(row=>row.family))],wardrobes:[...new Set(part(split).map(row=>row.wardrobeId))]}]))};
  return {artifact,dataset};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const source=JSON.parse(readFileSync(new URL('../experiments/data/wardrobes.json',import.meta.url),'utf8'));
  const {artifact,dataset}=trainRanker(source);
  mkdirSync(new URL('./artifacts/',import.meta.url),{recursive:true});
  writeFileSync(new URL('./artifacts/ranker.json',import.meta.url),JSON.stringify(artifact,null,2)+'\n');
  writeFileSync(new URL('./artifacts/ranking-protocol.json',import.meta.url),JSON.stringify({...dataset,rows:undefined,sourceSha256:artifact.sourceSha256,datasetSha256:artifact.datasetSha256,queries:dataset.rows.length},null,2)+'\n');
  console.log(JSON.stringify({activation:artifact.activation,metrics:artifact.metrics,splits:artifact.splits},null,2));
}
