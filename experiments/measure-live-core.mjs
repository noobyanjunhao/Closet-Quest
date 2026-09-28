import '../server/env.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { retrieveWardrobe } from '../server/retrieval.js';
import { retrieveWardrobeHybrid } from '../server/hybrid-retrieval.js';
import { hybridRetrievalCases } from '../vision/hybrid-retrieval-cases.mjs';
import { photoCollection, sampleItem } from '../src/wardrobe.js';
import { openAIStatus } from '../server/openai.js';

const origin=process.env.CLOSET_EVAL_ORIGIN||'http://127.0.0.1:5173';
const report={date:new Date().toISOString(),protocol:'Live local HTTP and CPU-embedding measurements on public sample metadata and eight reused authored semantic development cases. No private wardrobe records. Existing disk cache retained; cold and warm conditions reported separately. Not held-out quality or cloud performance evidence.',retrieval:[],http:[],local:[],openai:{status:'not_run_no_key'}};
for(const fixture of hybridRetrievalCases()) {
  const options={request:fixture.request,context:fixture.context};
  const lexical=retrieveWardrobe(fixture.items,options);
  const start=performance.now();const hybrid=await retrieveWardrobeHybrid(fixture.items,options,{timeoutMs:6000,rerankerOptions:{enabled:false}});
  const recall=result=>fixture.expectedIds.filter(id=>result.items.some(item=>item.id===id)).length/fixture.expectedIds.length;
  const row={id:fixture.id,bm25Recall:recall(lexical),hybridRecall:recall(hybrid),ms:performance.now()-start,fallback:hybrid.retrieval.fallback,cache:hybrid.retrieval.embedding.cache};report.retrieval.push(row);console.log(JSON.stringify(row));
}
const fixture=hybridRetrievalCases()[0],options={request:fixture.request,context:fixture.context};
const two=[],one=[];
for(let repeat=0;repeat<10;repeat++) {
  const first=performance.now();await retrieveWardrobeHybrid(fixture.items,options,{timeoutMs:6000});await retrieveWardrobeHybrid(fixture.items,options,{timeoutMs:6000});two.push(performance.now()-first);
  const second=performance.now();await retrieveWardrobeHybrid(fixture.items,options,{timeoutMs:6000});one.push(performance.now()-second);
}
report.retrievalPassExperiment={protocol:'10 alternating warm pairs on the same authored 64-item case. Isolates retrieval overhead only; excludes model generation and browser.',twoPassMs:two,onePassMs:one};
const body={items:photoCollection.map(sampleItem).map(({image,...item})=>item),context:'Campus casual',request:'A relaxed outfit in green and sand. Use pieces I rarely wear.',requireLowUse:true};
async function request(provider) {
  const started=performance.now();
  const response=await fetch(origin+'/api/style',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,provider}),signal:AbortSignal.timeout(65000)});
  const result=await response.json();
  const row={provider,httpStatus:response.status,wallMs:performance.now()-started,model:result.model,pipeline:result.pipeline,outfits:result.data?.outfits.map(({title,itemIds})=>({title,itemIds})),retrieval:{method:result.retrieval?.method,fallback:result.retrieval?.fallback,cache:result.retrieval?.embedding?.cache},error:result.error};console.log(JSON.stringify(row));return row;
}
for(let repeat=0;repeat<10;repeat++)report.http.push(await request('quick'));
for(let repeat=0;repeat<2;repeat++)report.local.push(await request('local'));
if(openAIStatus().configured)report.openai={status:'measured',runs:[await request('openai'),await request('openai')]};
await mkdir(new URL('./results/',import.meta.url),{recursive:true});await writeFile(new URL('./results/live-core-v2.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('Saved experiments/results/live-core-v2.json');
