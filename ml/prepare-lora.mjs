import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {exportLearningData} from '../server/learning.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function prepareLora(examples,task='outfit-selection') {
  const allowed=['outfit-selection','metadata-correction'];
  if(!allowed.includes(task))throw new Error('Choose outfit-selection or metadata-correction.');
  const unique=new Map(),inputs=new Map();
  for(const row of examples.filter(row=>row.task===task)) {
    if(!Array.isArray(row.messages)||row.messages.length!==3||row.messages.map(m=>m.role).join(',')!=='system,user,assistant'||row.messages.some(m=>typeof m.content!=='string'||m.content.length>16000))throw new Error('Invalid chat example.');
    const fingerprint=hash(row.messages),inputHash=hash(row.messages.slice(0,2));
    unique.set(fingerprint,{...row,fingerprint,inputHash});
    if(!inputs.has(inputHash))inputs.set(inputHash,new Set());inputs.get(inputHash).add(row.messages[2].content);
  }
  // Text-only correction cannot resolve two different labels for the identical input; omit such conflicts.
  const rows=[...unique.values()].filter(row=>task!=='metadata-correction'||inputs.get(row.inputHash).size===1);
  // Union identical inputs and repeated garment/photo groups before splitting.
  const parent=new Map();const find=key=>{if(!parent.has(key))parent.set(key,key);if(parent.get(key)!==key)parent.set(key,find(parent.get(key)));return parent.get(key);};
  for(const row of rows){const a=find(`input:${row.inputHash}`),b=find(`record:${row.group}`);if(a!==b)parent.set(a,b);}
  const groups=[...new Set(rows.map(row=>find(`input:${row.inputHash}`)))].sort((a,b)=>hash(a).localeCompare(hash(b)));
  const trainEnd=Math.floor(groups.length*.7),validationEnd=Math.floor(groups.length*.85);
  const splitFor=new Map(groups.map((group,index)=>[group,index<trainEnd?'train':index<validationEnd?'validation':'test']));
  const splits={train:[],validation:[],test:[]};
  for(const row of rows) {const split=splitFor.get(find(`input:${row.inputHash}`));splits[split].push({id:row.id,group:hash(find(`input:${row.inputHash}`)),fingerprint:row.fingerprint,prompt:row.messages.slice(0,2),completion:row.messages.slice(2)});}
  const counts=Object.fromEntries(Object.entries(splits).map(([split,data])=>[split,data.length]));
  const ready=rows.length>=60&&groups.length>=12&&counts.train>=30&&counts.validation>=5&&counts.test>=5;
  const manifest={schemaVersion:1,task,ready,source:'real reviewed local events only; sample/demo events excluded',sourceExamplesSha256:hash(examples.filter(row=>row.task===task)),examples:rows.length,groups:groups.length,counts,deduplicated:examples.filter(row=>row.task===task).length-unique.size,conflictingExamplesOmitted:unique.size-rows.length,datasetSha256:hash(splits),files:Object.fromEntries(Object.entries(splits).map(([key,data])=>[key,{name:`${key}.jsonl`,sha256:createHash('sha256').update(data.map(row=>JSON.stringify(row)).join('\n')+(data.length?'\n':'')).digest('hex')}])),protocol:'70/15/15 split of connected input/photo groups, hash-sorted; no duplicate prompt or garment/photo group crosses a partition. Minimum 60 examples, 12 groups, split counts 30/5/5. This is a project readiness threshold, not proof of generalization.',limitations:task==='metadata-correction'?'Text-only draft correction; no visual evidence. This does not train the vision recognizer. Vision LoRA requires a separate explicit image-consent dataset.':'Learns approved item selection for a saved occasion; raw mood briefs and prose are deliberately not collected.'};
  return {manifest,splits};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),task=args.find(arg=>arg.startsWith('--task='))?.slice(7)||'outfit-selection';
  const {manifest,splits}=prepareLora(exportLearningData().examples,task);
  if(args.includes('--write')) {
    const directory=new URL(`../vision/private/learning/lora-${task}/`,import.meta.url);mkdirSync(directory,{recursive:true});
    for(const [split,rows] of Object.entries(splits))writeFileSync(new URL(`${split}.jsonl`,directory),rows.map(row=>JSON.stringify(row)).join('\n')+(rows.length?'\n':''));
    writeFileSync(new URL('manifest.json',directory),JSON.stringify(manifest,null,2)+'\n');
  }
  console.log(JSON.stringify(manifest,null,2));
}
