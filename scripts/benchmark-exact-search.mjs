import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createKnowledgeStore} from '../server/knowledge.js';
const dir=await mkdtemp(join(tmpdir(),'closet-exact-benchmark-'));
const id='11111111-1111-4111-a111-111111111111';
// Fixed local embeddings isolate the database/scoring path from API latency.
const embeddingClient={async embed(records){return {
  vectors:records.map(record=>Array.from({length:512},(_,i)=>Math.sin(i+record.text.length)+0.1)),
  metadata:{provider:'local',model:'synthetic-512',digest:'fixed',schemaVersion:'benchmark-v1',dimensions:512},
};}};
let cached,uncached;
try{
  cached=createKnowledgeStore({storageDir:dir,seedDocuments:[],embeddingClient});
  for(let i=0;i<12;i++)await cached.upsert(id,{title:`Style note ${i}`,content:('Navy jackets and tailored trousers suit a formal wedding. Comfortable shoes work for coffee. '+i+' ').repeat(160)});
  uncached=createKnowledgeStore({storageDir:dir,seedDocuments:[],embeddingClient,searchCacheEntries:0});
  const samples={uncached:[],prepared:[]},queries=['formal wedding','coffee and comfortable shoes','tailored navy jackets'];
  let expected=new Map(),chunks;
  for(let i=0;i<105;i++){
    const query=queries[i%queries.length];
    // Alternate order to reduce warm-up/order bias; exclude first five rounds.
    for(const [mode,store] of (i%2?[['prepared',cached],['uncached',uncached]]:[['uncached',uncached],['prepared',cached]])){
      const start=performance.now(),result=await store.search(id,query);
      const elapsed=performance.now()-start;chunks=result.metadata.totalChunks;
      if(expected.has(query))assert.deepEqual(result.sources,expected.get(query));else expected.set(query,result.sources);
      if(i>=5)samples[mode].push({totalMs:elapsed,scoringMs:result.metadata.exactSearch.scoringMs,cache:result.metadata.exactSearch.cache});
    }
  }
  const percentile=(list,p)=>[...list].sort((a,b)=>a-b)[Math.ceil(list.length*p)-1];
  const summary=Object.fromEntries(Object.entries(samples).map(([mode,list])=>[mode,{
    samples:list.length,medianTotalMs:percentile(list.map(r=>r.totalMs),0.5),
    p95TotalMs:percentile(list.map(r=>r.totalMs),0.95),medianScoringMs:percentile(list.map(r=>r.scoringMs),0.5),
  }]));
  const result={measuredAt:new Date().toISOString(),chunks,dimensions:512,design:'Paired local searches with deterministic synthetic embeddings. Uncached preparation vs bounded prepared-record cache. Exact returned sources and scores checked on all 210 searches. No network/model-generation latency.',summary};
  await mkdir('output/mobile',{recursive:true});
  await writeFile('output/mobile/exact-search-benchmark.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}finally{cached?.close();uncached?.close();await rm(dir,{recursive:true,force:true});}
