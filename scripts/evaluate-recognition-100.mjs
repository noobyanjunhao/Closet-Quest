import '../server/env.js';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createRecognitionProvider} from '../server/recognition-provider.js';
import {openAIModelFor} from '../server/openai.js';
import {scoreRecognition} from './recognition-metrics.mjs';

const arg=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];};
const mode=arg('--mode','both'),limit=Number(arg('--limit','100'));
if(!['single','multiple','both'].includes(mode)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Use --mode single|multiple|both and --limit 1..100.');
const manifestBytes=await readFile('data/evaluation/recognition-100/manifest.json');
const manifest=JSON.parse(manifestBytes),manifestSha256=createHash('sha256').update(manifestBytes).digest('hex');
if(manifest.images.length!==100||new Set(manifest.images.map(im=>im.id)).size!==100)throw Error('Expected 100 unique manifest images.');
const excluded=new Set(manifest.excludedPriorImageIds);
for(const im of manifest.images){
  if(excluded.has(im.id)||!/^[a-f0-9]+\.jpg$/.test(im.file_name))throw Error('Invalid manifest image.');
  const bytes=await readFile(`vision/private/recognition-100/images/${im.file_name}`);
  if(createHash('sha256').update(bytes).digest('hex')!==im.sha256)throw Error(`Image checksum mismatch: ${im.id}`);
}
if(!process.argv.includes('--live')){
  console.log(JSON.stringify({verifiedImages:100,manifestSha256,predictionsRun:0,message:'Dataset checks passed. Add --live to run paid OpenAI recognition; both modes make up to 200 pipeline requests.'}));
  process.exit(0);
}
const model=openAIModelFor('recognition','fast'),output=`output/recognition-100/${mode}-${limit}.json`;
await mkdir('output/recognition-100',{recursive:true});
let rows=[];
try{
  const saved=JSON.parse(await readFile(output,'utf8'));
  if(saved.manifestSha256!==manifestSha256||saved.model!==model||saved.profile!=='fast')throw Error('Existing result identity differs; preserve it and choose a new run file.');
  rows=saved.rows;
}catch(error){if(error.code!=='ENOENT')throw error;}
const recognize=createRecognitionProvider({ttlMs:0});
const tasks=manifest.images.slice(0,limit).flatMap((im,index)=>(mode==='both'?(index%2?['multiple','single']:['single','multiple']):[mode]).map(mode=>({im,mode})));
// Serial requests avoid burst pressure and keep each image's latency interpretable.
for(const {im,mode:taskMode} of tasks){
  if(rows.some(r=>r.imageId===im.id&&r.mode===taskMode))continue;
  const start=performance.now();
  let row={imageId:im.id,mode:taskMode,expected:im.expected,annotatedHat:im.annotatedHat,stratum:im.stratum};
  try{
    const bytes=await readFile(`vision/private/recognition-100/images/${im.file_name}`);
    const result=await recognize(`data:image/jpeg;base64,${bytes.toString('base64')}`,{provider:'openai',modelProfile:'fast',detectionMode:taskMode,wardrobeId:'recognition-100-evaluation'});
    const pieces=taskMode==='multiple'?result.garments:[result.data];
    row={...row,status:'completed',predicted:[...new Set(pieces.map(p=>p.category))].sort(),
      hatDetected:pieces.some(p=>['Hat','Baseball cap'].includes(p.itemType)),
      pieces:pieces.map(p=>({category:p.category,itemType:p.itemType,boundingBox:p.boundingBox})),
      actualModel:result.model,usage:result.usage};
  }catch(error){row={...row,status:'failed',predicted:[],hatDetected:false,code:error.code||error.name};}
  row.latencyMs=Math.round(performance.now()-start);rows.push(row);
  const report={measuredAt:new Date().toISOString(),manifestSha256,model,profile:'fast',
    protocol:'Frozen public images; serial first requests, recognition cache disabled. Failures remain in all-image recall/exact-match denominators. Category-set evaluation, not instance segmentation or human acceptance.',
    plannedTasks:tasks.length,completedTasks:rows.length,complete:rows.length===tasks.length,summary:scoreRecognition(rows),rows};
  await writeFile(output+'.tmp',JSON.stringify(report,null,2)+'\n');await rename(output+'.tmp',output);
  console.log(JSON.stringify({imageId:row.imageId,mode:row.mode,status:row.status,latencyMs:row.latencyMs}));
}
