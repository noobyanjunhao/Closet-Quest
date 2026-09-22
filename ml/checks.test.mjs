import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FEATURE_NAMES,loadRanker,rerankCandidates,validRanker} from '../server/reranker.js';
import {buildRankingDataset,trainRanker} from './train-ranker.mjs';
import {sanitizeLearningEvent,recordLearningEvent,exportLearningData,getLearningStatus} from '../server/learning.js';
import {prepareLora} from './prepare-lora.mjs';
const source=JSON.parse(readFileSync(new URL('../experiments/data/wardrobes.json',import.meta.url)));
const correction=(extra={})=>({type:'recognition_correction',source:'user',wardrobeId:'local-wardrobe',itemId:'piece',reviewed:true,before:{category:'Top',itemType:'Trousers',colorName:'Beige'},after:{category:'Bottom',itemType:'Trousers',colorName:'Beige'},...extra});

test('ranker split isolates normalized wardrobe families and brief templates',()=>{
  const data=buildRankingDataset(source);
  for(const key of ['wardrobeId','family','request']){const seen=new Map();for(const row of data.rows){assert.ok(!seen.has(row[key])||seen.get(row[key])===row.split);seen.set(row[key],row.split);}}
  const variants=data.rows.filter(row=>['balanced-1','mixed-case-1','context-conflict-1'].includes(row.wardrobeId));
  assert.equal(new Set(variants.map(row=>row.family)).size,1);
});
test('pairwise training reproduces committed weights and untouched held-out metrics',()=>{
  const trained=trainRanker(source).artifact,committed=loadRanker();
  assert.deepEqual(trained.weights,committed.weights);assert.equal(trained.datasetSha256,committed.datasetSha256);assert.deepEqual(trained.metrics,committed.metrics);
  assert.equal(trained.weights[FEATURE_NAMES.indexOf('denseReciprocalRank')],0);
  assert.ok(trained.metrics.test.gain>=trained.activation.minimumGain);
});
test('trained development reranker stays disabled without explicit opt-in and rejects failed gates',()=>{
  const model=loadRanker(),input={items:[{id:'a',category:'Top',tags:'Campus casual',wears:0}],candidates:[{id:'a',lexicalRank:1,denseScore:null,rrfScore:0.02}],context:'Campus casual',request:'Choose a top'};
  const disabled=rerankCandidates(input,{model,enabled:false});assert.equal(disabled.metadata.active,false);assert.equal(disabled.scores[0].score,0.02);assert.equal(disabled.metadata.proxyGatePassed,true);
  assert.equal(rerankCandidates(input,{model,enabled:true}).metadata.active,true);
  assert.equal(validRanker({...model,weights:[NaN]}),false);
  assert.equal(validRanker({...model,activation:{...model.activation,passed:false}}),false);
  const regressed=structuredClone(model);regressed.metrics.test.trained.pairAccuracy=0;assert.equal(validRanker(regressed),false);
});
test('learning event allowlist removes photo, identity, free text and hashes local IDs',()=>{
  const event=sanitizeLearningEvent(correction({image:'data:image/jpeg;base64,secret',profile:'PRIVATE_PERSON',request:'PRIVATE_BRIEF',before:{category:'Top',name:'PRIVATE_NAME',visibleLabelText:'PRIVATE_LABEL'}}));
  const json=JSON.stringify(event);for(const text of ['PRIVATE','data:image','local-wardrobe','"piece"'])assert.ok(!json.includes(text));
  assert.match(event.itemHash,/^[a-f0-9]{64}$/);assert.deepEqual(event.before,{category:'Top'});
  assert.throws(()=>sanitizeLearningEvent(correction({reviewed:false})),{code:'INVALID_LEARNING_EVENT'});
  assert.throws(()=>sanitizeLearningEvent(correction({photoSha256:'data:image/foo'})),{code:'INVALID_LEARNING_EVENT'});
});
test('events deduplicate, sample events never count for readiness, exports stay text-only',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'closet-learning-')),'events.jsonl');
  try{
    assert.equal(recordLearningEvent(correction({source:'sample'}),{path}).saved,true);
    assert.equal(recordLearningEvent(correction({source:'sample'}),{path}).duplicate,true);
    assert.equal(getLearningStatus({path}).realReviewedExamples,0);
    recordLearningEvent(correction(),{path});const data=exportLearningData({path});
    assert.equal(data.examples.length,1);assert.equal(data.examples[0].task,'metadata-correction');assert.equal(data.status.loraReady,false);
  }finally{unlinkSync(path);}
});
test('feedback rejects invented or incomplete outfits and preserves explicit negative feedback',()=>{
  const feedback={type:'outfit_feedback',source:'user',wardrobeId:'w',context:'Campus casual',feedback:'dislike',candidates:[{id:'top',category:'Top'},{id:'bottom',category:'Bottom'},{id:'shoe',category:'Shoes'}],selectedItemIds:['top','bottom','shoe']};
  assert.equal(sanitizeLearningEvent(feedback).feedback,'dislike');
  assert.throws(()=>sanitizeLearningEvent({...feedback,selectedItemIds:['top','unknown']}),{code:'INVALID_LEARNING_EVENT'});
  assert.throws(()=>sanitizeLearningEvent({...feedback,selectedItemIds:['top','bottom']}),{code:'INVALID_LEARNING_EVENT'});
});
const example=(id,group=id,prompt=id,answer=id)=>({id,group,task:'outfit-selection',messages:[{role:'system',content:'Select owned items.'},{role:'user',content:prompt},{role:'assistant',content:answer}]});
test('LoRA preflight rejects scarcity and splits whole connected inputs, not random rows',()=>{
  assert.equal(prepareLora([]).manifest.ready,false);
  const fixtures=Array.from({length:80},(_,index)=>example(String(index)));
  fixtures.push(example('same-input','different-group','0','alternative'));
  const {manifest,splits}=prepareLora(fixtures);assert.equal(manifest.ready,true);
  const memberships={};for(const [split,rows] of Object.entries(splits))for(const row of rows){const prompt=row.prompt[1].content;assert.ok(!memberships[prompt]||memberships[prompt]===split);memberships[prompt]=split;}
  assert.ok(Object.values(splits).some(rows=>rows.some(row=>row.id==='0')&&rows.some(row=>row.id==='same-input')));
  assert.deepEqual(prepareLora(fixtures).manifest,manifest);
});
test('LoRA preflight removes duplicate messages and conflicting text-correction targets',()=>{
  const duplicate=example('1'),data=prepareLora([duplicate,{...duplicate,id:'2'}]);assert.equal(data.manifest.examples,1);assert.equal(data.manifest.deduplicated,1);
  const corrections=[{...example('1','a','same','first'),task:'metadata-correction'},{...example('2','b','same','second'),task:'metadata-correction'}];
  const result=prepareLora(corrections,'metadata-correction');assert.equal(result.manifest.examples,0);assert.equal(result.manifest.conflictingExamplesOmitted,2);assert.equal(result.manifest.ready,false);
});
