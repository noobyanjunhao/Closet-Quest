import '../server/env.js';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {retrieveWardrobeHybrid} from '../server/hybrid-retrieval.js';
import {createRetrievalProvider,interactiveRetrievalOptions,createScopedDocumentEmbeddings} from '../server/retrieval-provider.js';
import {createKnowledgeStore} from '../server/knowledge.js';

// Synthetic garments/notes only. Measures retrieval, not generated outfit quality
// or hosted cold-start latency. Requires the existing server OpenAI environment.
const items=Array.from({length:18},(_,i)=>({
  id:`benchmark-${i}`,category:['Top','Bottom','Shoes','Dress','Outerwear','Accessory'][i%6],
  name:['White cotton shirt','Navy tailored trousers','Black leather shoes','Blue midi dress','Navy blazer','Silver watch'][i%6],
  wears:i%4,colorName:['White','Navy','Black','Blue','Navy','Silver'][i%6],
}));
const provider=createRetrievalProvider();
const requests=['I am going to a wedding, give me something formal.','Casual coffee with friends.','A polished look for a work presentation.'];
const results=[];
for(const request of requests){
  const wardrobeId=randomUUID(),dependencies=provider({provider:'openai',embeddingProvider:'openai',wardrobeId});
  for(const mode of ['hybrid-cold','hybrid-warm','fast-small-closet']){
    const options=mode==='fast-small-closet'?interactiveRetrievalOptions({items,provider:'openai',preferences:{modelProfile:'fast'}}):{};
    const started=performance.now();
    const result=await retrieveWardrobeHybrid(items,{request,allowPartial:true},{...dependencies,...options});
    if(result.retrieval.fallback?.active)throw Error(`Unexpected fallback: ${result.retrieval.fallback.code}`);
    results.push({request,mode,ms:Number((performance.now()-started).toFixed(2)),retrieved:result.items.length,
      allEligibleIncluded:items.every(item=>result.items.some(candidate=>candidate.id===item.id)),
      embeddingCache:result.retrieval.embedding.cache||null,acceleration:result.retrieval.acceleration||null});
  }
}
const dir=await mkdtemp(join(tmpdir(),'closet-retrieval-benchmark-'));
const store=createKnowledgeStore({storageDir:dir,seedDocuments:[],embeddingClients:{openai:createScopedDocumentEmbeddings(provider)}});
const documentResults=[];
try{
  const id=randomUUID();
  await store.upsert(id,{title:'Formal occasions',content:'For a formal wedding, consider tailored trousers, a matching jacket, a crisp shirt and polished shoes. Follow the invitation dress code.'},{embeddingProvider:'openai'});
  for(const query of requests)for(const mode of ['cold-query','cached-query']){
    const started=performance.now();
    const result=await store.search(id,query,{embeddingProvider:'openai'});
    if(result.metadata.mode!=='hybrid')throw Error(`Unexpected document mode: ${result.metadata.mode}`);
    documentResults.push({query,mode,ms:Number((performance.now()-started).toFixed(2)),sources:result.sources.length,cache:result.metadata.queryEmbeddingCache});
  }
}finally{store.close();await rm(dir,{recursive:true,force:true});}
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
const summary={
  wardrobeMs:Object.fromEntries(['hybrid-cold','hybrid-warm','fast-small-closet'].map(mode=>[mode,median(results.filter(r=>r.mode===mode).map(r=>r.ms))])),
  documentsMs:Object.fromEntries(['cold-query','cached-query'].map(mode=>[mode,median(documentResults.filter(r=>r.mode===mode).map(r=>r.ms))])),
};
const report={date:new Date().toISOString(),design:'Three synthetic briefs, 18 reviewed garments, one synthetic style note; sequential paired cold/warm retrieval. Live OpenAI embeddings, local process. No outfit acceptance or hosted total-latency claim.',summary,wardrobe:results,documents:documentResults};
await mkdir('output/mobile',{recursive:true});
await writeFile('output/mobile/retrieval-speed-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
