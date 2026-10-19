// Diagnostic 2x2 experiment: genuine provider calls, fictional inputs, no human ratings.
import '../server/env.js';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createOpenAIChat,createOpenAIEmbeddingClient,resolveOpenAIModel} from '../server/openai.js';
import {createRetrievalProvider} from '../server/retrieval-provider.js';
import {createKnowledgeStore} from '../server/knowledge.js';
import {recommend} from '../server/recommendation.js';
import {measureOutfits} from '../src/validation.js';

if(!process.argv.includes('--live'))throw Error('Use --live: at most 30 generation requests and 120 embedding HTTP calls, using fictional data.');
const root='output/sprint7';
const items=JSON.parse(await readFile(`${root}/stylist.json`,'utf8')).items;
const cases=[
 {id:'a01',context:'Presentation day',request:'Choose an outfit for my thesis seminar.',targets:['red-shirt','black-pants','boots'],note:'For my thesis seminar I prefer my red fitted shirt, black straight trousers and black ankle boots. This is my saved personal combination.'},
 {id:'a02',context:'Campus casual',request:'Choose an outfit for the library study group.',targets:['black-tee','photo-denim','photo-sneakers'],note:'For the library study group I prefer my plain black relaxed tee, everyday blue jeans and white canvas sneakers.'},
 {id:'a03',context:'Coffee date',request:'Choose an outfit for Sunday cafe reading.',targets:['photo-knit','photo-trousers','boots'],note:'For Sunday cafe reading I prefer my forest cable-knit sweater, pleated sand trousers and black ankle boots.'},
 {id:'a04',context:'Presentation day',request:'Choose an outfit for the design studio critique.',targets:['black-tee','photo-trousers','photo-sneakers'],note:'For the design studio critique I prefer my plain black relaxed tee, pleated sand trousers and white canvas sneakers.'},
 {id:'a05',context:'Campus casual',request:'Choose an outfit for the museum sketching trip.',targets:['photo-tee','black-pants','boots'],note:'For the museum sketching trip I prefer my landscape graphic tee, black straight trousers and black ankle boots.'},
 {id:'a06',context:'Coffee date',request:'Choose an outfit for the alumni coffee meeting.',targets:['red-shirt','photo-denim','photo-sneakers'],note:'For the alumni coffee meeting I prefer my red fitted shirt, everyday blue jeans and white canvas sneakers.'},
].map((c,i)=>({...c,documentId:`71000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`}));
const conditions=['neither','documents','feedback','both'];
const protocol={version:1,source:'Six project-authored fictional briefs; zero human participants.',frozenAt:new Date().toISOString(),items,cases,conditions,
 design:'2x2 documents x feedback. Same wardrobe, brief, neutral explicit preferences, generator and planning rules. Feedback is three helpful votes for the target trio. Documents share a nine-note library plus built-in style guides. Rotate condition order by brief; repeat both immediately once.',
 outcomes:'Target-trio hit@3 = any of the first up to three returned looks contains all three predefined IDs (extra layers/accessories allowed). Count failed/empty attempts as misses. Also record target availability among candidate plans and actual prompt passage exposure; no model judge is used.',
 latency:'Fresh in-process wardrobe embedding cache for each initial condition, then immediate both repeat using the same cache. Document indexes prebuilt. This is cache-cold/cache-warm local orchestration plus real API time, not Render idle startup or phone latency.',
 limits:'Six feature-aligned authored cases; one initial generation per condition and six correlated repeats; no user acceptance or causal population estimate. Exact target matching is a preference-recall proxy, not fashion quality.',model:resolveOpenAIModel('recommendation','fast')};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
protocol.designHash=hash({...protocol,frozenAt:undefined});
await mkdir(root,{recursive:true});
let out;
try{out=JSON.parse(await readFile(`${root}/ablation.json`,'utf8'));if(out.protocol.designHash!==protocol.designHash)throw Error('Protocol changed: preserve existing results and choose a new output path.');}
catch(e){if(e.code!=='ENOENT')throw e;out={protocol,startedAt:new Date().toISOString(),indexing:[],rows:[],lexicalRetrieval:[]};}
const persist=()=>writeFile(`${root}/ablation.json`,JSON.stringify(out,null,2)+'\n');
await persist(); // Freeze targets before any inference.
let embeddingCalls=0,generationCalls=0;
const countedFetch=(...args)=>{if(++embeddingCalls>120)throw Error('Embedding HTTP budget exhausted');return fetch(...args);};
const embed=createOpenAIEmbeddingClient({fetchImpl:countedFetch});
const store=createKnowledgeStore({storageDir:await mkdtemp(join(tmpdir(),'cq-ablation-')),embeddingClients:{openai:embed},indexTimeoutMs:15000,searchTimeoutMs:5000});
const namespace='72000000-0000-4000-a000-000000000001';
const includesTargets=(ids,targets)=>targets.every(id=>ids.includes(id));
try{
 for(const c of cases){const r=await store.upsert(namespace,{id:c.documentId,title:c.request,content:c.note,source:'Authored fictional preference; fixed before generation'},{embeddingProvider:'openai'});out.indexing.push({caseId:c.id,indexing:r.indexing});}
 for(const [i,note] of ['Laundry: wash delicate knitwear according to its care label.','Storage: fold sweaters and hang tailored jackets.','Shopping: use owned pieces before considering another purchase.'].entries())await store.upsert(namespace,{id:`73000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`,title:['Laundry notes','Closet storage','Shopping notes'][i],content:note,source:'Authored distractor'},{embeddingProvider:'openai'});
 for(let i=0;i<cases.length;i++){
  const c=cases[i],order=conditions.slice(i%4).concat(conditions.slice(0,i%4));
  if(!out.lexicalRetrieval.some(r=>r.caseId===c.id)){const value=await store.search(namespace,`${c.context} ${c.request}`,{lexicalOnly:true,embeddingProvider:'openai',limit:4});out.lexicalRetrieval.push({caseId:c.id,...value});await persist();}
  for(const condition of order){
   const dependencies=createRetrievalProvider({openaiFactory:opts=>createOpenAIEmbeddingClient({...opts,fetchImpl:countedFetch}),memoryCache:new Map()})({provider:'openai',embeddingProvider:'openai',wardrobeId:namespace});
   for(let repeat=0;repeat<(condition==='both'?2:1);repeat++){
    if(out.rows.some(r=>r.caseId===c.id&&r.condition===condition&&r.repeat===repeat))continue;
    const hasDocs=['documents','both'].includes(condition),hasFeedback=['feedback','both'].includes(condition);
    const start=performance.now();let prompt=null;
    const generate=createOpenAIChat({model:protocol.model,modelProfile:'fast',timeoutMs:45000});
    let row={caseId:c.id,condition,repeat,startedAt:new Date().toISOString()};
    try{
     const value=await recommend({wardrobeId:namespace,items,context:c.context,request:c.request,provider:'openai',preferences:{modelProfile:'fast',embeddingProvider:'openai'},recommendationHistory:hasFeedback?Array.from({length:3},()=>({feedback:'helpful',chosenItemIds:c.targets})):[]},{retrievalDependencies:dependencies,knowledgeSearch:hasDocs?(_id,q,o)=>store.search(namespace,q,{...o,embeddingProvider:'openai'}):undefined,openaiChat:async(...args)=>{if(++generationCalls>30)throw Error('Generation budget exhausted');prompt=JSON.parse(args[2]);return generate(...args);}});
     const looks=value.data.outfits.slice(0,3),checks=measureOutfits(looks,items);
     row={...row,status:'completed',elapsedMs:Math.round(performance.now()-start),hitAt3:looks.some(o=>includesTargets(o.itemIds,c.targets)),targetPlanAvailable:value.planning.candidates.some(p=>includesTargets(p.itemIds,c.targets)),bestTargetFraction:Math.max(0,...looks.map(o=>c.targets.filter(id=>o.itemIds.includes(id)).length/3)),checks,outfits:looks,pipeline:value.pipeline,retrieval:value.retrieval,planning:value.planning,prompt,model:value.model,usage:value.usage};
    }catch(e){row={...row,status:'failed',elapsedMs:Math.round(performance.now()-start),code:e.code||e.name,hitAt3:false,outfits:[],prompt};}
    out.rows.push(row);await persist();console.log(JSON.stringify({caseId:c.id,condition,repeat,status:row.status,hitAt3:row.hitAt3,targetPlanAvailable:row.targetPlanAvailable,elapsedMs:row.elapsedMs,fallback:row.pipeline?.fallback?.code}));
   }
  }
 }
}finally{store.close();out.finishedAt=new Date().toISOString();out.callsThisExecution={generationCalls,embeddingCalls};await persist();}
