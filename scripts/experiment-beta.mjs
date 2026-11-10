import {createServer} from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createShoppingLibrary} from '../server/shopping-library.js';
import {createWorkLimiter} from '../server/work-limiter.js';
import {assessPhotoQuality} from '../server/photo-quality.js';
const out='output/sprint9';mkdirSync(out,{recursive:true});
const query={category:'Top',occasion:'formal',presentation:'any',maxPrice:null};
const result=q=>({query:q,searchedAt:new Date().toISOString(),products:[{title:'Synthetic shirt',url:'https://www.jcrew.com/p/shirt/FIXTURE',price:40,currency:'USD'}]});
const percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1];
async function burst({library=true,distinct=false,latency=40,waitMs=4000}){
 let calls=0,active=0,peak=0;
 const provider=async q=>{if(active>=2)throw Object.assign(Error('busy'),{status:429});calls++;active++;peak=Math.max(peak,active);try{await delay(latency);return result(q);}finally{active--;}};
 const shop=library?createShoppingLibrary({seed:[],search:provider,limiter:createWorkLimiter({waitMs})}):null;
 const server=createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;try{const value=await(shop?shop.find(JSON.parse(body)):provider(JSON.parse(body)));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));}catch(e){res.writeHead(e.status||503,{'content-type':'application/json'});res.end(JSON.stringify({code:e.code||'BUSY'}));}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const run=async()=>Promise.all(Array.from({length:40},async(_,i)=>{const start=performance.now();const r=await fetch(base,{method:'POST',body:JSON.stringify({...query,maxPrice:distinct?50+i:null})});await r.text();return {status:r.status,ms:performance.now()-start};}));
  const cold=await run(),coldCalls=calls,warm=library?await run():[];
  const summarize=rows=>({requests:rows.length,ok:rows.filter(r=>r.status===200).length,statuses:rows.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{}),medianMs:Number(percentile(rows.map(r=>r.ms),.5)?.toFixed(2)),p95Ms:Number(percentile(rows.map(r=>r.ms),.95)?.toFixed(2))});
  return {library,distinct,injectedProviderLatencyMs:latency,waitBudgetMs:waitMs,cold:{...summarize(cold),providerCalls:coldCalls},warm:warm.length?{...summarize(warm),providerCalls:calls-coldCalls}:null,peakProviderConcurrency:peak,stats:shop?.stats()};
 }finally{await new Promise(r=>server.close(r));}
}
const loads=[];
for(const options of [{library:false},{library:true},{library:false,distinct:true},{library:true,distinct:true},{library:true,distinct:true,latency:120,waitMs:50}])loads.push(await burst(options));
writeFileSync(`${out}/shopping-load.json`,JSON.stringify({measuredAt:new Date().toISOString(),kind:'deterministic provider with real local HTTP; not observed retailer traffic',scenarios:loads},null,2)+'\n');
const manifest=JSON.parse(readFileSync('output/sprint8/manifest.json')),photos=[];
for(const im of manifest.images){
 const bytes=readFileSync(`vision/private/sprint8/${im.file_name}`);if(createHash('sha256').update(bytes).digest('hex')!==im.sha256)throw Error('Frozen photo mismatch');
 for(const variant of ['original','dim','blur']){
  const p=sharp(bytes).rotate();if(variant==='dim')p.modulate({brightness:.35});if(variant==='blur')p.resize({width:160,height:160,fit:'inside'}).blur(1.2);
  const {data,info}=await p.jpeg({quality:variant==='blur'?50:85}).toBuffer({resolveWithObject:true});const start=performance.now();
  photos.push({id:im.id,variant,quality:await assessPhotoQuality(data,info),elapsedMs:Number((performance.now()-start).toFixed(2))});
 }
}
const qualitySummary=Object.fromEntries(['original','dim','blur'].map(v=>{const rows=photos.filter(p=>p.variant===v);return[v,{photos:rows.length,anyWarning:rows.filter(r=>r.quality.flags.length).length,lowResolution:rows.filter(r=>r.quality.flags.includes('low-resolution')).length,dark:rows.filter(r=>r.quality.flags.includes('dark')).length,softDetail:rows.filter(r=>r.quality.flags.includes('soft-detail')).length,medianMs:percentile(rows.map(r=>r.elapsedMs),.5)}];}));
writeFileSync(`${out}/photo-quality.json`,JSON.stringify({measuredAt:new Date().toISOString(),kind:'heuristic warning analysis on reused Sprint 8 photos; no new model calls or users',independentPhotos:manifest.images.length,summary:qualitySummary,photos},null,2)+'\n');
console.log(JSON.stringify({loads,qualitySummary},null,2));

