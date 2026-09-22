import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {recognize,style} from '../server/agents.js';
import {initialState} from '../src/logic.js';
const cpu=process.argv.includes('--cpu');
const sources=JSON.parse(await fs.readFile(new URL('./real-photos/sources.json',import.meta.url)));
const evidence={date:new Date().toISOString(),protocol:'Two real-photo development smoke cases, one call each including load overhead. Not a held-out accuracy benchmark. Styling uses seeded metadata. No training.',cpuRequested:cpu,recognition:[]};
for(const source of sources){
 const raw=await fs.readFile(new URL('./real-photos/'+source.file,import.meta.url));
 const photo=await sharp(raw).resize({width:700,height:700,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer();
 try{const result=await recognize('data:image/jpeg;base64,'+photo.toString('base64'),{cpu});evidence.recognition.push({...source,sha256:crypto.createHash('sha256').update(raw).digest('hex'),...result,correct:result.data.category===source.expectedCategory});console.log(source.file,result.data.category,result.latencyMs+'ms');}
 catch(e){evidence.recognition.push({...source,error:e.message});console.log(source.file,e.message);}
}
evidence.runtime=await fetch('http://127.0.0.1:11434/api/ps').then(r=>r.json());
try{evidence.styling=await style({items:initialState().items,request:'Coffee date: relaxed but put together, refreshing color combinations. Explain silhouette choices.'},{cpu});console.log('Styling:',evidence.styling.data.outfits.length,'valid outfits',evidence.styling.latencyMs+'ms');}catch(e){evidence.styling={error:e.message};}
await fs.mkdir(new URL('./results/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('./results/local-agents-'+(cpu?'cpu':'gpu')+'.json',import.meta.url),JSON.stringify(evidence,null,2));
