import {mkdirSync,readFileSync,appendFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ITEM_CATEGORIES,COLORS} from './recognition.js';
import {loadRanker,validRanker} from './reranker.js';

const DEFAULT_PATH=fileURLToPath(new URL('../vision/private/learning/events.jsonl',import.meta.url));
const categories=['Top','Bottom','Dress','Shoes','Outerwear','Accessory'];
const contexts=['Campus casual','Coffee date','Presentation day'];
const fits=['Regular','Relaxed','Fitted','Oversized','Not applicable','Unknown'];
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const invalid=message=>Object.assign(new Error(message),{status:400,code:'INVALID_LEARNING_EVENT'});
const id=value=>{if(typeof value!=='string'||!value.trim()||value.length>160)throw invalid('A bounded local record identifier is required.');return value;};
function attributes(input,required=false) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw invalid('Send reviewed garment attributes.');
  const result={};
  if(categories.includes(input.category))result.category=input.category;else if(required)throw invalid('Choose a supported reviewed category.');
  if(Object.hasOwn(ITEM_CATEGORIES,input.itemType))result.itemType=input.itemType;
  if(Object.hasOwn(COLORS,input.colorName))result.colorName=input.colorName;
  if(fits.includes(input.fit))result.fit=input.fit;
  return result;
}
export function sanitizeLearningEvent(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||!['user','sample'].includes(input.source))throw invalid('Declare whether the example comes from a real garment or a sample.');
  const event={schemaVersion:1,type:input.type,source:input.source,wardrobeHash:digest(id(input.wardrobeId))};
  if(input.type==='recognition_correction') {
    if(input.reviewed!==true)throw invalid('Only explicitly saved, reviewed corrections are learning examples.');
    event.itemHash=digest(id(input.itemId));
    if(input.photoSha256!==undefined&&!/^[a-f0-9]{64}$/i.test(input.photoSha256))throw invalid('Use a SHA-256 photo fingerprint, not photo bytes.');
    if(input.photoSha256)event.photoSha256=input.photoSha256.toLowerCase();
    event.before=attributes(input.before||{});event.after=attributes(input.after,true);event.reviewed=true;
  } else if(input.type==='outfit_feedback') {
    if(!['like','dislike'].includes(input.feedback)||!contexts.includes(input.context)||!Array.isArray(input.candidates)||input.candidates.length<2||input.candidates.length>18||!Array.isArray(input.selectedItemIds)||input.selectedItemIds.length<2||input.selectedItemIds.length>8)throw invalid('Feedback needs an occasion, owned candidate items and a selected outfit.');
    const ids=input.candidates.map(item=>id(item.id));
    if(new Set(ids).size!==ids.length||new Set(input.selectedItemIds).size!==input.selectedItemIds.length||input.selectedItemIds.some(value=>!ids.includes(value)))throw invalid('Feedback item IDs must be unique and owned.');
    event.context=input.context;event.feedback=input.feedback;
    event.candidates=input.candidates.map(item=>({id:digest(item.id),...attributes(item,true),wears:Number.isFinite(item.wears)&&item.wears>=0?Math.min(100000,Math.floor(item.wears)):0}));
    event.selectedItemIds=input.selectedItemIds.map(digest);
    const selected=event.candidates.filter(item=>event.selectedItemIds.includes(item.id)),count=category=>selected.filter(item=>item.category===category).length;
    if(count('Shoes')!==1||count('Outerwear')>1||!((count('Top')===1&&count('Bottom')===1&&!count('Dress'))||(count('Dress')===1&&!count('Top')&&!count('Bottom'))))throw invalid('Only complete owned outfits can be recorded as training feedback.');
  } else throw invalid('Unsupported learning event type.');
  // Names, raw prompts, images, profiles, labels and unknown fields never enter the local log.
  return {...event,eventId:randomUUID(),createdAt:new Date().toISOString(),fingerprint:digest(JSON.stringify(event))};
}
export function readLearningEvents({path=DEFAULT_PATH}={}) {
  let text;try{text=readFileSync(path,'utf8');}catch(error){if(error.code==='ENOENT')return [];throw error;}
  return text.split('\n').filter(Boolean).map((line,index)=>{try{return JSON.parse(line);}catch{throw new Error(`Learning log has an invalid row at ${index+1}; repair it before exporting.`);}});
}
export function recordLearningEvent(input,options={}) {
  const event=sanitizeLearningEvent(input),events=readLearningEvents(options),existing=events.find(row=>row.fingerprint===event.fingerprint);
  if(existing)return {saved:false,duplicate:true,eventId:existing.eventId,status:getLearningStatus(options)};
  if(events.length>=10000)throw Object.assign(new Error('The local learning log reached 10,000 events. Export it before collecting more.'),{status:409});
  const path=options.path||DEFAULT_PATH;mkdirSync(dirname(path),{recursive:true});appendFileSync(path,JSON.stringify(event)+'\n','utf8');
  return {saved:true,duplicate:false,eventId:event.eventId,status:getLearningStatus(options)};
}
function chatExample(event) {
  if(event.source!=='user')return null;
  if(event.type==='recognition_correction'&&event.reviewed&&Object.keys(event.before).length&&JSON.stringify(event.before)!==JSON.stringify(event.after))return {id:event.eventId,task:'metadata-correction',group:event.photoSha256||event.itemHash,messages:[{role:'system',content:'Correct draft wardrobe metadata using reviewed labels. Return only the corrected JSON attributes. This is a text correction task; no photograph is supplied.'},{role:'user',content:JSON.stringify(event.before)},{role:'assistant',content:JSON.stringify(event.after)}]};
  if(event.type==='outfit_feedback'&&event.feedback==='like') {
    const alias=new Map(event.candidates.map((item,index)=>[item.id,`G${index+1}`]));
    const candidates=event.candidates.map(({id,...item})=>({id:alias.get(id),...item}));
    return {id:event.eventId,task:'outfit-selection',group:digest(JSON.stringify({context:event.context,candidates})),messages:[{role:'system',content:'Select an owned outfit for the occasion. Return JSON with itemIds only. Use one top and bottom or one dress, exactly one pair of shoes, optional outerwear and accessories.'},{role:'user',content:JSON.stringify({context:event.context,candidates})},{role:'assistant',content:JSON.stringify({itemIds:event.selectedItemIds.map(value=>alias.get(value))})}]};
  }
  return null;
}
export function exportLearningData(options={}) {
  const events=readLearningEvents(options),examples=events.map(chatExample).filter(Boolean);
  return {schemaVersion:1,privacy:'Allowlisted metadata only; no photos, raw briefs, names, visible labels or profiles. Record identifiers are hashed, not anonymized.',tasks:['metadata-correction','outfit-selection'],examples,events,status:getLearningStatus(options)};
}
export function getLearningStatus(options={}) {
  const events=readLearningEvents(options),examples=events.map(chatExample).filter(Boolean);
  const tasks=Object.fromEntries(['metadata-correction','outfit-selection'].map(task=>{
    const unique=[...new Map(examples.filter(row=>row.task===task).map(row=>[JSON.stringify(row.messages),row])).values()];
    const targets=new Map();for(const row of unique){const key=JSON.stringify(row.messages.slice(0,2));if(!targets.has(key))targets.set(key,new Set());targets.get(key).add(row.messages[2].content);}
    const rows=unique.filter(row=>task!=='metadata-correction'||targets.get(JSON.stringify(row.messages.slice(0,2))).size===1),groups=new Set(rows.map(row=>row.group));
    const candidateReady=rows.length>=60&&groups.size>=12;
    let ready=false;
    if(candidateReady)try{
      const directory=join(dirname(options.path||DEFAULT_PATH),`lora-${task}`),manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
      ready=manifest.ready===true&&manifest.sourceExamplesSha256===digest(JSON.stringify(examples.filter(row=>row.task===task)))&&['train','validation','test'].every(split=>createHash('sha256').update(readFileSync(join(directory,`${split}.jsonl`))).digest('hex')===manifest.files[split].sha256);
    }catch{/* A missing, stale or edited preparation is not ready for training. */}
    return [task,{examples:rows.length,groups:groups.size,minimumExamples:60,minimumGroups:12,ready,candidateReady}];
  }));
  const ranker=loadRanker(),enabled=process.env.CLOSET_LEARNED_RERANKER==='1',proxyGatePassed=validRanker(ranker);
  const loraReady=Object.values(tasks).some(task=>task.ready);
  return {totalEvents:events.length,sampleEvents:events.filter(event=>event.source==='sample').length,recognitionCorrections:events.filter(event=>event.type==='recognition_correction').length,outfitFeedback:events.filter(event=>event.type==='outfit_feedback').length,realReviewedExamples:Object.values(tasks).reduce((sum,task)=>sum+task.examples,0),tasks,loraReady,preparationRequired:!loraReady,reason:'LoRA requires at least 60 distinct real reviewed examples in one task and 12 input groups, then a successful grouped-split preflight. Sample events do not count. Run the preflight to establish readiness; collecting feedback never trains an adapter.',ranker:{modelVersion:ranker?.version||null,trainingDomain:ranker?.trainingDomain||null,enabled,active:enabled&&proxyGatePassed,proxyGatePassed,denseFeaturesTrained:ranker?.denseFeaturesTrained===true,metrics:ranker?.metrics||null}};
}
