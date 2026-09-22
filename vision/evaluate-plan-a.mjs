import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {recognize} from '../server/agents.js';
import {PIPELINE_VERSION,PROMPT_HASH} from '../server/recognition.js';
const sources=JSON.parse(await fs.readFile(new URL('../public/photos/sources.json',import.meta.url)));
const model=process.env.CLOSET_EVAL_MODEL||'qwen3-vl:4b-instruct-q4_K_M';
const tags=await fetch('http://127.0.0.1:11434/api/tags').then(r=>r.json());
const identity=tags.models.find(m=>m.name===model);
if(!identity)throw new Error('Install '+model+' before evaluating.');
const result={date:new Date().toISOString(),model,digest:identity.digest,pipelineVersion:PIPELINE_VERSION,promptSha256:PROMPT_HASH,protocol:'Seven reused public demo photos; development comparison only, not held-out accuracy. No model weights have been fine-tuned. Expected labels are scoring-only.',recognition:[]};
for(const source of sources){
  const bytes=await fs.readFile(new URL('../public/photos/'+source.file,import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw new Error('Photo changed: '+source.file);
  const start=performance.now();
  try{const response=await recognize('data:image/jpeg;base64,'+bytes.toString('base64'),{model});result.recognition.push({id:source.id,expectedCategory:source.category,...response,categoryMatches:response.data.category===source.category});}
  catch(error){result.recognition.push({id:source.id,error:error.message,code:error.code});}
  result.recognition.at(-1).totalMs=Math.round(performance.now()-start);
  console.log(source.id+': '+JSON.stringify(result.recognition.at(-1).data?.category||result.recognition.at(-1).error)+' / '+result.recognition.at(-1).totalMs+' ms');
}
result.summary={total:sources.length,completed:result.recognition.filter(r=>r.data).length,categoryMatches:result.recognition.filter(r=>r.categoryMatches).length,meanLatencyMs:Math.round(result.recognition.reduce((sum,r)=>sum+r.totalMs,0)/sources.length)};
await fs.mkdir(new URL('./results/plan-a-runs/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('./results/plan-a-runs/'+result.date.replace(/[:.]/g,'-')+'.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
await fs.writeFile(new URL('./results/plan-a-development.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary));
