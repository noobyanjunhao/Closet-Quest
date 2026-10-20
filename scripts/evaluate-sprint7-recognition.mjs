import '../server/env.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRecognitionProvider} from '../server/recognition-provider.js';
if(!process.argv.includes('--live'))throw Error('Use --live for the bounded public-image OpenAI evaluation.');
const root='output/sprint7',manifest=JSON.parse(await readFile(`${root}/dataset-manifest.json`,'utf8'));
await mkdir(root,{recursive:true});
const recheck=process.argv.includes('--recheck-failures'),output=recheck?'recognition-recheck.json':'recognition.json';
const failedIds=recheck?JSON.parse(await readFile(`${root}/recognition.json`,'utf8')).rows.filter(r=>r.mode==='multiple'&&r.status==='failed').map(r=>r.imageId):[];
let rows=[];try{rows=JSON.parse(await readFile(`${root}/${output}`,'utf8')).rows;}catch{}
const recognize=createRecognitionProvider();
const tasks=manifest.images.flatMap((im,index)=>(index%2?['multiple','single']:['single','multiple']).map(mode=>({im,mode}))).filter(t=>!recheck||(t.mode==='multiple'&&failedIds.includes(t.im.id)));
let saving=Promise.resolve();
async function worker(){while(tasks.length){const {im,mode}=tasks.shift();if(rows.some(r=>r.imageId===im.id&&r.mode===mode))continue;
 const start=performance.now();let row={imageId:im.id,stratum:im.stratum,mode,expected:im.expected,annotatedHat:im.annotatedHat};
 try{const image=`data:image/jpeg;base64,${(await readFile(`vision/private/fashionpedia/${im.file_name}`)).toString('base64')}`;
 const v=await recognize(image,{provider:'openai',modelProfile:'fast',detectionMode:mode,wardrobeId:'sprint7-public-benchmark'});
 const pieces=mode==='multiple'?v.garments:[v.data];const predicted=[...new Set(pieces.map(p=>p.category))].sort();
 row={...row,status:'completed',model:v.model,latencyMs:Math.round(performance.now()-start),predicted,pieces:pieces.map(p=>({category:p.category,itemType:p.itemType,boundingBox:p.boundingBox})),usage:v.usage,pipeline:v.pipeline};
 }catch(e){row={...row,status:'failed',code:e.code||e.name,latencyMs:Math.round(performance.now()-start),predicted:[]};}
 row.tp=row.predicted.filter(c=>row.expected.includes(c)).length;row.fp=row.predicted.filter(c=>!row.expected.includes(c)).length;row.fn=row.expected.filter(c=>!row.predicted.includes(c)).length;
 row.hatDetected=row.pieces?.some(p=>['Hat','Baseball cap'].includes(p.itemType))||false;
 rows.push(row);const snapshot=JSON.stringify({measuredAt:new Date().toISOString(),protocol:'Category-set precision/recall. Errors predict empty sets and remain in recall denominator. Two concurrent workers; first inference, not server cold start. No human labels or training claims.',targetedRecheck:recheck,rows},null,2);saving=saving.then(()=>writeFile(`${root}/${output}`,snapshot));await saving;
 console.log(JSON.stringify({imageId:im.id,mode,status:row.status,code:row.code,tp:row.tp,fp:row.fp,fn:row.fn,latencyMs:row.latencyMs}));
}}
await Promise.all([worker(),worker()]);
