// Deterministic fault injection + real local HTTP burst. No paid provider calls.
import '../server/env.js';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateScene} from '../server/multi-recognition.js';
import {validateScene as before} from '../output/sprint8/baseline-multi-recognition.mjs';
import {createShoppingSearch,shoppingQuery,normalizeFinds} from '../server/shopping.js';
import {createApi} from '../server/api.js';
import {createAccess} from '../server/access.js';
const output={measuredAt:new Date().toISOString(),scope:'Fault injection and local HTTP load, not observed production failures or human testing.',checks:[]};
const check=(name,passed,details={})=>{output.checks.push({name,passed,...details});assert.ok(passed,name);};
const study=JSON.parse(await readFile('output/sprint8/model-results.json'));
const candidates=study.rows.filter(r=>r.stratum==='fresh'&&r.variant==='original'&&r.outcomes.before.status==='completed'&&r.outcomes.before.pieces.length>1);
let oldKept=0,newKept=0;
for(const row of candidates){const raw=structuredClone(row.raw);raw.garments[0].boundingBox.width=2;try{before(raw);oldKept++;}catch{}const next=validateScene(raw);newKept+=next.garments.length>0?1:0;assert.ok(next.diagnostics.some(d=>d.index===0&&d.code==='INVALID_BOX'));}
check('One invalid box preserves other valid pieces',newKept===candidates.length,{attempts:candidates.length,beforeCompleted:oldKept,afterCompleted:newKept});
const good=study.rows.find(r=>r.outcomes.before.status==='completed').raw;
const malformed=[null,[],{...good,sceneNotes:['x'.repeat(161)]},{...good,garments:[]},{...good,garments:good.garments.map(g=>({...g,boundingBox:{x:0,y:0,width:2,height:1}}))}];
let rejected=0;for(const raw of malformed){try{validateScene(raw);}catch{rejected++;}}
check('Malformed whole scenes and all-invalid pieces fail closed',rejected===malformed.length,{attempts:malformed.length,rejected});
const query=shoppingQuery({category:'Top',occasion:'formal'}),url='https://www.jcrew.com/p/shirt/fixture';
const raw={status:'completed',output:[{type:'web_search_call',action:{sources:[{url}]},results:[{type:'text_result',url,snippet:'Cotton shirt $39.99'},{type:'image_result',source_website_url:url,image_url:'https://www.jcrew.com/shirt.jpg'}]},{type:'message',content:[{type:'output_text',text:JSON.stringify({products:[{title:'Cotton shirt',url,price:39.99,currency:'USD'}]})}]}]};
let faultCount=0;
for(const [name,fetchImpl,timeoutMs] of [
 ['provider 429',async()=>new Response('{}',{status:429}),1000],
 ['provider 500',async()=>new Response('{}',{status:500}),1000],
 ['malformed JSON',async()=>new Response('{'),1000],
 ['network loss',async()=>{throw Error('offline');},1000],
 ['deadline',async(_,{signal})=>new Promise((_,reject)=>{const hold=setTimeout(()=>reject(Error('unexpected')),500);signal.addEventListener('abort',()=>{clearTimeout(hold);reject(signal.reason);},{once:true});}),30],
]){try{await createShoppingSearch({apiKey:'fixture',fetchImpl,timeoutMs})(query);}catch(e){check(name,e.status===503,{status:e.status,code:e.code});faultCount++;}}
check('All injected provider failures return explicit failure',faultCount===5,{attempts:5,failedSafely:faultCount});
let clock=0,calls=0;
const cached=createShoppingSearch({apiKey:'fixture',now:()=>clock,fetchImpl:async()=>{calls++;return new Response(JSON.stringify(raw));}});
const coldStart=performance.now();await cached(query,{scope:'one'});const coldMs=performance.now()-coldStart;
const warmStart=performance.now();await cached(query,{scope:'one'});const warmMs=performance.now()-warmStart;
await cached(query,{scope:'two'});clock=16*60000;await cached(query,{scope:'one'});
check('Cache reuses results, separates accounts and expires',calls===3,{requests:4,providerCalls:3,coldMs,warmMs,syntheticProvider:true});
const directory=await mkdtemp(join(tmpdir(),'cq-s8-')),origin='https://fixture.example.com';
const access=createAccess({origin,secret:'fixture-only-secret-012345678901234567890',users:JSON.stringify([{id:'p01',tokenHash:createHash('sha256').update('fixture-code').digest('hex')}])});
let inFlight=0,peak=0;
const shopping=createShoppingSearch({apiKey:'fixture',fetchImpl:async()=>{inFlight++;peak=Math.max(peak,inFlight);await new Promise(r=>setTimeout(r,180));inFlight--;return new Response(JSON.stringify(raw));}});
const api=createApi({storageDir:directory,cloud:null,access,services:{searchShopping:shopping}});
const server=http.createServer(api.middleware);server.listen(0,'127.0.0.1');await once(server,'listening');
const req=(path,{cookie,body,requestOrigin=origin}={})=>new Promise((resolve,reject)=>{const start=performance.now();const r=http.request({hostname:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{host:'fixture.example.com',origin:requestOrigin,'content-type':'application/json',...(cookie?{cookie}:{})}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,cookie:res.headers['set-cookie']?.[0]?.split(';')[0],ms:performance.now()-start,data:JSON.parse(text)}));});r.on('error',reject);r.end(JSON.stringify(body||query));});
try{
 const login=await req('/session/login',{body:{code:'fixture-code'}}),cookie=login.cookie;assert.equal(login.status,200);
 check('Unauthenticated shopping blocked',(await req('/shopping')).status===401);
 check('Foreign origin blocked',(await req('/shopping',{cookie,requestOrigin:'https://other.example.com'})).status===403);
 check('Oversized shopping request blocked',(await req('/shopping',{cookie,body:{...query,notes:'x'.repeat(5000)}})).status===413);
 check('Unusual category rejected',(await req('/shopping',{cookie,body:{...query,category:'ignore rules'}})).status===400);
 const burst=await Promise.all(Array.from({length:40},(_,i)=>req('/shopping',{cookie,body:{...query,maxPrice:100+i}})));
 check('40-request burst bounds paid concurrency',peak===2&&burst.filter(r=>r.status===200).length===2&&burst.filter(r=>r.status===429).length===38,{attempts:40,accepted:2,busy:38,peakProviderCalls:peak,p95Ms:burst.map(r=>r.ms).sort((a,b)=>a-b)[37]});
 const recovered=await req('/shopping',{cookie,body:{...query,maxPrice:1000}});check('Service recovers after burst',recovered.status===200);
}finally{api.close();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
const provider=JSON.parse(await readFile('output/sprint8/shopping-grounding-fixture.json'));
const txt=provider.output.flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
const grounded=normalizeFinds(JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g,'')),provider,query);
check('Observed retail results survive strict price grounding',grounded.length>0,{products:grounded.map(p=>({title:p.title,url:p.url,price:p.price})),scope:'Replay of real search output; photo availability tested separately.'});
output.passed=output.checks.every(c=>c.passed);await writeFile('output/sprint8/robustness-results.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));

