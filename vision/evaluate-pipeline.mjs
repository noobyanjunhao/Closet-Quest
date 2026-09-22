import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { PIPELINE_VERSION, PROMPT_HASH } from '../server/recognition.js';

const endpoint='http://127.0.0.1:5173/api';
const sources=JSON.parse(await fs.readFile(new URL('../public/photos/sources.json',import.meta.url)));
const baseline=JSON.parse(await fs.readFile(new URL('./results/photo-collection-smoke.json',import.meta.url)));
const status=await fetch(`${endpoint}/status`).then(r=>r.json());
if(!status.ready || status.pipelineVersion!==PIPELINE_VERSION)throw new Error('Start the current development API and local model before evaluating.');
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const result={date:new Date().toISOString(),pipelineVersion:PIPELINE_VERSION,promptSha256:PROMPT_HASH,
  protocol:'Same seven attributed demo photographs reused to debug the first run. Development regression check, not a held-out test or an accuracy estimate. Schema and prompt refined; same model, no weight training. Expected labels are used only for scoring, never sent to inference. One generated blank-image negative control is reported separately.',
  baseline:{path:'vision/results/photo-collection-smoke.json',date:baseline.date,summary:baseline.summary},recognition:[],controls:[]};

async function evaluate({id,bytes,mime='jpeg',...reference}) {
  const start=performance.now();
  const response=await fetch(`${endpoint}/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:`data:image/${mime};base64,${bytes.toString('base64')}`}),signal:AbortSignal.timeout(15000)});
  const accepted=await response.json(),acceptanceMs=Math.round(performance.now()-start);
  if(response.status!==202)throw new Error(accepted.error||`HTTP ${response.status}`);
  let job=accepted;
  const observedStages=[{stage:job.stage,atMs:acceptanceMs}];
  try {
    while(['queued','processing'].includes(job.status)&&performance.now()-start<240000) {
      await delay(250);
      const polled=await fetch(`${endpoint}/jobs/${accepted.id}`,{signal:AbortSignal.timeout(15000)});
      if(!polled.ok)throw new Error(`Polling failed: HTTP ${polled.status}`);
      job=await polled.json();
      if(observedStages.at(-1).stage!==job.stage)observedStages.push({stage:job.stage,atMs:Math.round(performance.now()-start)});
    }
    const record={id,...reference,inputSha256:createHash('sha256').update(bytes).digest('hex'),acceptanceMs,totalMs:Math.round(performance.now()-start),status:job.status,attempt:job.attempt,observedStages,
      ...(job.result?{...job.result,categoryMatches:job.result.data.category===reference.expectedCategory}:{error:job.error||'Evaluation timed out',errorCode:job.errorCode||'EVALUATION_TIMEOUT'})};
    if(record.pipeline && (record.pipeline.version!==PIPELINE_VERSION||record.pipeline.promptSha256!==PROMPT_HASH))throw new Error('The running pipeline changed during evaluation.');
    console.log(`${id}: ${record.status}, ${record.data?.category||record.errorCode}; ${record.totalMs} ms (${acceptanceMs} ms acceptance)`);
    return record;
  } finally { await fetch(`${endpoint}/jobs/${accepted.id}`,{method:'DELETE',signal:AbortSignal.timeout(15000)}); }
}

for(const source of sources) {
  const bytes=await fs.readFile(new URL(`../public/photos/${source.file}`,import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw new Error(`Photo hash changed: ${source.file}`);
  const previous=baseline.recognition.find(r=>r.id===source.id);
  result.recognition.push(await evaluate({id:source.id,bytes,source:source.source,expectedCategory:source.category,baselineStatus:previous.status,baselineCategory:previous.data?.category||null,baselineMatches:!!previous.categoryMatches}));
}
const blank=await sharp({create:{width:400,height:400,channels:3,background:'#ffffff'}}).png().toBuffer();
result.controls.push(await evaluate({id:'blank-image',bytes:blank,mime:'png',expectedErrorCode:'EMPTY_IMAGE',synthetic:true}));
result.runtime=await fetch('http://127.0.0.1:11434/api/ps',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
result.summary={completed:result.recognition.filter(r=>r.status==='ready').length,total:sources.length,categoryMatches:result.recognition.filter(r=>r.categoryMatches).length,negativeControlsPassed:result.controls.filter(r=>r.errorCode===r.expectedErrorCode).length,negativeControlsTotal:result.controls.length};
// Archive every run; the original v1 baseline is never overwritten.
await fs.mkdir(new URL('./results/pipeline-runs/',import.meta.url),{recursive:true});
await fs.writeFile(new URL(`./results/pipeline-runs/${runId}.json`,import.meta.url),JSON.stringify(result,null,2)+'\n');
await fs.writeFile(new URL('./results/pipeline-v2-development.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary));
if(result.summary.categoryMatches!==sources.length||result.summary.negativeControlsPassed!==result.summary.negativeControlsTotal)process.exitCode=1;
