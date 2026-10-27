import '../server/env.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {normalizePhoto} from '../server/recognition.js';
import {sceneSchema,SCENE_PROMPT,validateScene} from '../server/multi-recognition.js';
import {validateScene as before} from '../output/sprint8/baseline-multi-recognition.mjs';
import {createOpenAIChat,openAIModelFor} from '../server/openai.js';
import {scoreRecognition} from './recognition-metrics.mjs';
const dir='output/sprint8',manifestBytes=await readFile(`${dir}/manifest.json`),manifest=JSON.parse(manifestBytes);
const old=JSON.parse(await readFile('data/evaluation/recognition-100/manifest.json'));
const prior=JSON.parse(await readFile('output/recognition-100/both-100.json'));
const failed=new Set(prior.rows.filter(r=>r.mode==='multiple'&&r.status==='failed').map(r=>r.imageId));
const tasks=[...manifest.images.flatMap(im=>['original','low-light','small-blur'].map(variant=>({im,variant,stratum:'fresh',path:`vision/private/sprint8/${im.file_name}`}))),...old.images.filter(im=>failed.has(im.id)).map(im=>({im,variant:'original',stratum:'selected-recheck',path:`vision/private/recognition-100/images/${im.file_name}`}))];
const model=openAIModelFor('recognition','fast'),identity=createHash('sha256').update(manifestBytes).update(await readFile('server/multi-recognition.js')).update(model).digest('hex');
let rows=[];try{const saved=JSON.parse(await readFile(`${dir}/model-results.json`));if(saved.identity!==identity)throw Error('Preserve existing run; protocol changed.');rows=saved.rows;}catch(e){if(e.code!=='ENOENT')throw e;}
const generate=createOpenAIChat({task:'recognition',model,modelProfile:'fast',imageDetail:'high',maxOutputTokens:4096,timeoutMs:45000});
for(const task of tasks){
 const key=`${task.stratum}:${task.im.id}:${task.variant}`;if(rows.some(r=>r.key===key))continue;
 const start=performance.now();let raw,modelError;
 try{let bytes=await readFile(task.path);if(createHash('sha256').update(bytes).digest('hex')!==task.im.sha256)throw Error('Photo hash changed');
  if(task.variant==='low-light')bytes=await sharp(bytes).modulate({brightness:.35}).jpeg({quality:85}).toBuffer();
  if(task.variant==='small-blur')bytes=await sharp(bytes).resize({width:160,height:160,fit:'inside'}).blur(1.2).jpeg({quality:50}).toBuffer();
  const photo=await normalizePhoto(`data:image/jpeg;base64,${bytes.toString('base64')}`);
  raw=await generate(sceneSchema,SCENE_PROMPT,'Find each visible garment and accessory, including small hats and eyewear. Return separate observations and crop rectangles.',photo.base64);
 }catch(e){modelError=e.code||e.name;}
 const latencyMs=Math.round(performance.now()-start),outcomes={};
 for(const [mode,validator] of [['before',before],['after',validateScene]]){
  try{if(modelError)throw Object.assign(Error('Provider failed'),{code:modelError});const result=validator(raw.data);outcomes[mode]={mode,status:'completed',predicted:[...new Set(result.garments.map(g=>g.category))].sort(),pieces:result.garments.map(g=>({category:g.category,itemType:g.itemType,boundingBox:g.boundingBox})),omittedCount:result.omittedCount,diagnostics:result.diagnostics||[]};}
  catch(e){outcomes[mode]={mode,status:'failed',predicted:[],code:e.code||e.name,diagnostics:e.details?.diagnostics||[]};}
 }
 rows.push({key,imageId:task.im.id,stratum:task.stratum,variant:task.variant,expected:task.im.expected,latencyMs,modelError,raw:raw?.data,usage:raw?.usage,outcomes});
 const scores={};for(const stratum of ['fresh','selected-recheck'])for(const variant of ['original','low-light','small-blur']){const selected=rows.filter(r=>r.stratum===stratum&&r.variant===variant);if(selected.length)scores[`${stratum}:${variant}`]=scoreRecognition(selected.flatMap(r=>Object.values(r.outcomes).map(o=>({...o,expected:r.expected,latencyMs:r.latencyMs}))));}
 await writeFile(`${dir}/model-results.json`,JSON.stringify({identity,model,measuredAt:new Date().toISOString(),planned:tasks.length,complete:rows.length===tasks.length,rows,scores},null,2)+'\n');
 console.log(JSON.stringify({completed:rows.length,total:tasks.length,key,before:outcomes.before.status,after:outcomes.after.status}));
}
