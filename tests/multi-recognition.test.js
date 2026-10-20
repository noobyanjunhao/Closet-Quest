import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { validateScene, runSceneRecognition } from '../server/multi-recognition.js';
import { createRecognitionProvider } from '../server/recognition-provider.js';
import { publicJobResult } from '../server/job-store.js';
import { createJobQueue } from '../server/jobs.js';
import { createOpenAIChat } from '../server/openai.js';
import { detectionCrop, detectionDrafts, insertDetectionDrafts } from '../src/photo-import.js';

const observation=(itemType,colorFamily)=>({subjectStatus:'single_item',itemType,colorFamily,targetDescription:itemType,secondaryColors:[],pattern:'Solid',fit:'Relaxed',materialAppearance:'Visible fabric',occasions:['Campus casual'],styleTags:['Casual'],reviewNotes:[]});
const scene=()=>({garments:[{observation:observation('Baseball cap','Navy'),boundingBox:{x:.2,y:.05,width:.4,height:.2}},{observation:observation('Hoodie','Gray'),boundingBox:{x:.05,y:.4,width:.9,height:.6}}],sceneNotes:['The top is partly occluded.']});
async function photo(){return 'data:image/jpeg;base64,'+(await sharp({create:{width:400,height:600,channels:3,background:'#aaa'}}).composite([{input:Buffer.from('<svg width="100" height="100"><rect width="100" height="100" fill="navy"/></svg>')}]).jpeg().toBuffer()).toString('base64');}

test('outfit recognition preserves cap and clothing as separate validated, review-required results',async()=>{
  const stages=[];
  const result=await runSceneRecognition(await photo(),async(schema,prompt,content,pixels,options)=>{
    assert.equal(schema.properties.garments.maxItems,6);assert.match(prompt,/Do not choose only the largest/);assert.ok(pixels);assert.equal(options.maxOutputTokens,4096);
    return {data:scene(),model:'test'};
  },{onStage:s=>stages.push(s)});
  assert.deepEqual(stages,['preparing','recognizing','validating']);assert.deepEqual(result.garments.map(g=>g.category),['Accessory','Top']);
  assert.ok(result.garments.every(g=>g.reviewRequired));assert.equal(result.data.name,'Navy Baseball cap');
  const sanitized=publicJobResult(result);assert.equal(sanitized.garments.length,2,'Public metadata must not lose the first item through shared object identity.');
  assert.equal(sanitized.garments[0].itemType,'Baseball cap');assert.equal(sanitized.data.itemType,'Baseball cap');
});

test('invalid/empty scenes and unsafe crops abstain; overlapping duplicate targets are deduplicated',()=>{
  for(const value of [null,{}, {...scene(),garments:[]}, {...scene(),garments:Array(7).fill(scene().garments[0])}])assert.throws(()=>validateScene(value));
  for(const box of [{x:-.1,y:0,width:.5,height:.5},{x:.8,y:0,width:.5,height:.5},{x:0,y:0,width:NaN,height:.5},{x:0,y:0,width:.5,height:0}]){
    const value=scene();value.garments[0].boundingBox=box;assert.throws(()=>validateScene(value));
  }
  const duplicate=scene();duplicate.garments.push(structuredClone(duplicate.garments[0]));assert.equal(validateScene(duplicate).garments.length,2);
});

test('uncertain pieces abstain individually and never erase clear detections',()=>{
  const mixed=scene();mixed.garments[0].observation.subjectStatus='ambiguous';
  const result=validateScene(mixed);assert.equal(result.garments.length,1);assert.equal(result.garments[0].itemType,'Hoodie');assert.equal(result.omittedCount,1);assert.match(result.sceneNotes.at(-1),/uncertain piece/);
  mixed.garments[1].observation.subjectStatus='ambiguous';assert.throws(()=>validateScene(mixed),{code:'AMBIGUOUS_ITEM'});
  const malformed=scene();malformed.garments[0].observation.colorFamily='Invented';assert.throws(()=>validateScene(malformed));
});

test('single and scene results use separate caches and scene mode requests high-detail images',async()=>{
  let calls=0;const options=[];
  const provider=createRecognitionProvider({openaiFactory:o=>{options.push(o);return async(schema)=>{calls++;return {data:schema.properties.garments?scene():observation('Hoodie','Gray'),model:'test'};};}});
  const image=await photo(),selection={provider:'openai',wardrobeId:'multi-test'};
  await provider(image,selection);const multi=await provider(image,{...selection,detectionMode:'multiple'});
  assert.equal(calls,2);assert.equal(multi.garments.length,2);assert.equal(options[1].maxOutputTokens,4096);assert.equal(options[1].imageDetail,'high');
  assert.equal((await provider(image,{...selection,detectionMode:'multiple'})).pipeline.cache.hit,true);assert.equal(calls,2);
  await assert.rejects(provider(image,{...selection,detectionMode:'invalid'}),e=>e.code==='INVALID_DETECTION_MODE');
});

test('multi-piece jobs retain mode and all results across durable queue restart',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'closet-scene-'));t.after(()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true,force:true});});
  const first=createJobQueue(()=>new Promise(()=>{}),{storageDir:dir});
  const job=first.enqueue(await photo(),{provider:'openai',detectionMode:'multiple'});first.close();
  const second=createJobQueue(async(_,options)=>{assert.equal(options.detectionMode,'multiple');return {garments:validateScene(scene()).garments};},{storageDir:dir});t.after(()=>second.close());
  await new Promise(r=>setTimeout(r,30));assert.equal(second.get(job.id).status,'ready');assert.equal(second.get(job.id).result.garments.length,2);
});

test('selected pieces become independent review drafts atomically; repeat/stale imports cannot duplicate them',()=>{
  let counter=0;const source={id:'upload',photoKey:'photo-a',needsReview:true,recognition:{jobId:'job-a'},image:'original'};
  const result={...validateScene(scene()),pipeline:{inputSha256:'originalhash'},model:'test'};
  const drafts=detectionDrafts(source,result,[0,1],['cap-crop','top-crop'],()=>`id-${counter++}`);
  assert.deepEqual(drafts.map(d=>[d.name,d.category,d.image]),[['Navy Baseball cap','Accessory','cap-crop'],['Gray Hoodie','Top','top-crop']]);
  assert.ok(drafts.every(d=>d.needsReview&&!d.recognition.result.garments));assert.equal(new Set(drafts.map(d=>d.id)).size,2);
  assert.ok(drafts.every(draft=>draft.originalImage===source.image));
  const state={items:[source,{id:'existing'}],savedOutfits:[{id:'saved'}]},next=insertDetectionDrafts(state,source,'job-a',drafts);
  assert.equal(next.items.length,3);assert.equal(next.items[0].id,drafts[0].id);assert.equal(next.savedOutfits,state.savedOutfits);
  assert.throws(()=>insertDetectionDrafts(next,source,'job-a',drafts));
  assert.throws(()=>insertDetectionDrafts(state,source,'other-job',drafts));assert.throws(()=>detectionDrafts(source,result,[0,0],['a','b']));
  const reviewed={...source,needsReview:false,wears:4};const retained=insertDetectionDrafts({...state,items:[reviewed]},reviewed,'job-a',drafts);
  assert.equal(retained.items[0].wears,4);assert.equal(retained.items[0].id,'upload');assert.throws(()=>insertDetectionDrafts(retained,reviewed,'job-a',drafts));
});

test('scene crops map back into an explicitly cropped source photograph',()=>{
  const result={pipeline:{crop:{x:.1,y:.2,width:.5,height:.4}}};
  assert.deepEqual(detectionCrop(result,{boundingBox:{x:0,y:0,width:1,height:1}}),{x:.1,y:.2,width:.5,height:.4});
  assert.throws(()=>detectionCrop(result,{boundingBox:{x:1,y:0,width:1,height:1}}));
});

test('OpenAI distinguishes sandbox denial, transient connection errors and output truncation',async()=>{
  for(const code of ['EACCES','EPERM'])await assert.rejects(createOpenAIChat({apiKey:'test',fetchImpl:async()=>{throw Object.assign(new TypeError('fetch failed'),{cause:{code}});}})({},'', ''),e=>e.code==='OPENAI_NETWORK_PERMISSION'&&!e.retryable);
  await assert.rejects(createOpenAIChat({apiKey:'test',fetchImpl:async()=>{throw new TypeError('fetch failed');}})({},'',''),e=>e.code==='OPENAI_UNAVAILABLE'&&e.retryable);
  await assert.rejects(createOpenAIChat({apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}))})({},'',''),e=>e.code==='OPENAI_OUTPUT_LIMIT');
  await assert.rejects(createOpenAIChat({apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[]}))})({},'',''),e=>e.code==='OPENAI_INVALID_RESPONSE'&&e.retryable);
});
