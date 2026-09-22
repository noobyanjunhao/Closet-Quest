import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {retrieveWardrobe} from '../server/retrieval.js';
import {retrieveWardrobeHybrid} from '../server/hybrid-retrieval.js';
import {hybridRetrievalCases} from './hybrid-retrieval-cases.mjs';

const runs=[];
for(const fixture of hybridRetrievalCases()) {
  const options={request:fixture.request,context:fixture.context};
  const lexical=retrieveWardrobe(fixture.items,options);
  const started=performance.now();
  const hybrid=await retrieveWardrobeHybrid(fixture.items,options,{rerankerOptions:{enabled:false}});
  const recall=result=>fixture.expectedIds.filter(id=>result.items.some(item=>item.id===id)).length/fixture.expectedIds.length;
  const row={id:fixture.id,request:fixture.request,wardrobeCount:fixture.items.length,expectedIds:fixture.expectedIds,lexicalRecallAt18:recall(lexical),hybridRecallAt18:recall(hybrid),totalMs:Math.round(performance.now()-started),lexicalSelectedIds:lexical.items.map(item=>item.id),hybridSelectedIds:hybrid.items.map(item=>item.id),retrieval:hybrid.retrieval};
  runs.push(row);
  process.stdout.write(JSON.stringify({id:row.id,bm25:row.lexicalRecallAt18,hybrid:row.hybridRecallAt18,ms:row.totalMs,fallback:hybrid.retrieval.fallback.active,cache:hybrid.retrieval.embedding.cache})+'\n');
}
const mean=key=>runs.reduce((sum,run)=>sum+run[key],0)/runs.length;
const report={date:new Date().toISOString(),protocol:'Authored semantic-retrieval development probes over 64-item wardrobes. Separate from the learned ranker corpus; learned reranking disabled. Each query has one authored relevant target among descriptive distractors, including repeated variants. Measures recall@18 only; not held-out real-photo accuracy, wearer preference or a diverse production wardrobe benchmark. No prompt/model tuning performed by this script.',cases:runs,summary:{cases:runs.length,lexicalRecallAt18:mean('lexicalRecallAt18'),hybridRecallAt18:mean('hybridRecallAt18'),denseAvailableCases:runs.filter(run=>!run.retrieval.fallback.active).length,fallbackCases:runs.filter(run=>run.retrieval.fallback.active).length,totalMs:runs.reduce((sum,run)=>sum+run.totalMs,0)}};
const directory=fileURLToPath(new URL('./results/hybrid-runs/',import.meta.url));
await mkdir(directory,{recursive:true});
await writeFile(new URL('./results/hybrid-retrieval-development.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
await writeFile(new URL('./results/hybrid-runs/'+report.date.replace(/[:.]/g,'-')+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report.summary)+'\n');
