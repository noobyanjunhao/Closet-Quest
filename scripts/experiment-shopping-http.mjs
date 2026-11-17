// Actual application HTTP middleware, synthetic authentication/provider.
// Never contacts a model, retailer, cloud database or production service.
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
for(const name of Object.keys(process.env))if(/^(CLOSET_|SUPABASE_|OPENAI_|AWS_)/.test(name))delete process.env[name];
process.env.CLOSET_SKIP_ENV='1';
globalThis.fetch=()=>{throw Error('Outbound fetch forbidden in this experiment.');};
const [{createApi},{createAccess},{createShoppingLibrary},{createWorkLimiter}]=await Promise.all([
 import('../server/api.js'),import('../server/access.js'),import('../server/shopping-library.js'),import('../server/work-limiter.js')]);
const q={category:'Top',occasion:'formal',presentation:'any',maxPrice:null},categories=['Top','Bottom','Shoes','Dress','Outerwear','Accessory'];
const product=query=>({query,searchedAt:new Date().toISOString(),products:[{title:'Synthetic '+query.category,url:`https://www.jcrew.com/p/fixture/${query.category}`,price:40,currency:'USD'}]});
const percentile=(rows,p)=>Number([...rows].sort((a,b)=>a-b)[Math.ceil(rows.length*p)-1].toFixed(2));
const origin='https://closet.example';
async function scenario({name,library=true,distinct=false,latency=40,waitMs=4000,outage=false,warm=true}){
 const dir=await mkdtemp(join(tmpdir(),'closet-http-shopping-'));let calls=0,active=0,peak=0;
 const provider=async query=>{if(active>=2)throw Object.assign(Error('Synthetic old immediate admission limit'),{status:429});calls++;active++;peak=Math.max(peak,active);try{await delay(latency);if(outage)throw Object.assign(Error('Synthetic provider outage'),{status:503});return product(query);}finally{active--;}};
 const seed=outage?[{...product(q),searchedAt:new Date(Date.now()-2*86400000).toISOString()}]:[];
 const shop=library?createShoppingLibrary({seed,search:provider,limiter:createWorkLimiter({waitMs})}):{find:provider};
 const api=createApi({storageDir:dir,shoppingLibrary:shop,purchaseOptions:{enabled:false},cloud:{authenticate:async()=>({id:'synthetic-owner',namespace:'synthetic-owner',cloud:true})},access:createAccess({origin,secret:'synthetic-fixture-secret-never-used-in-production',cloud:true})});
 const server=http.createServer(api.middleware);server.listen(0,'127.0.0.1');await once(server,'listening');
 const request=body=>new Promise((resolve,reject)=>{const start=performance.now();const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/shopping',method:'POST',headers:{host:'closet.example',origin,'content-type':'application/json'}},res=>{let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{const data=JSON.parse(raw);resolve({status:res.statusCode,code:data.code||null,source:data.source||null,retryAfter:res.headers['retry-after']||null,ms:performance.now()-start});});});req.on('error',reject);req.end(JSON.stringify(body));});
 const queryFor=i=>distinct?{category:categories[i%6],occasion:i%12<6?'formal':'everyday',presentation:['any','menswear','womenswear'][Math.floor(i/12)%3],maxPrice:i>=36?80:null}:q;
 const run=()=>Promise.all(Array.from({length:40},(_,i)=>request(queryFor(i))));
 const summarize=rows=>({requests:rows.length,successful:rows.filter(r=>r.status===200).length,statuses:rows.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{}),p50Ms:percentile(rows.map(r=>r.ms),.5),p95Ms:percentile(rows.map(r=>r.ms),.95),retryAfterResponses:rows.filter(r=>r.retryAfter).length,savedFallbackResponses:rows.filter(r=>r.source==='saved-fallback').length});
 try{const cold=await run(),coldCalls=calls,warmRows=warm?await run():[];return {name,distinct,injectedProviderLatencyMs:latency,waitBudgetMs:waitMs,cold:{...summarize(cold),providerCalls:coldCalls},warm:warmRows.length?{...summarize(warmRows),providerCalls:calls-coldCalls}:null,peakProviderConcurrency:peak,libraryStats:shop.stats?.()||null};}
 finally{api.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
}
const scenarios=[];
for(const options of [
 {name:'old-immediate-admission-baseline',library:false,warm:false},
 {name:'current-equivalent-requests'},
 {name:'current-40-distinct-queries',distinct:true},
 {name:'bounded-overload',distinct:true,latency:500,waitMs:250,warm:false},
 {name:'provider-outage-saved-fallback',outage:true}
])scenarios.push(await scenario(options));
assert.equal(scenarios[0].cold.statuses[429],38);
assert.equal(scenarios[1].cold.successful,40);assert.equal(scenarios[1].cold.providerCalls,1);assert.equal(scenarios[1].warm.providerCalls,0);
assert.equal(scenarios[2].cold.successful,40);assert.equal(scenarios[2].peakProviderConcurrency,2);
assert.equal(scenarios[3].cold.statuses[503],38);assert.equal(scenarios[3].libraryStats.circuitOpen,false);assert.equal(scenarios[3].libraryStats.failures,0);
assert.equal(scenarios[4].cold.savedFallbackResponses,40);assert.equal(scenarios[4].cold.providerCalls,1);assert.equal(scenarios[4].warm.providerCalls,0);
const result={measuredAt:new Date().toISOString(),kind:'Real local application HTTP /shopping route; synthetic authentication, products and provider',scope:'Tests operational handling, not deployed capacity, provider speed, verified prices, fashion acceptance or real phone sessions.',scenarios,externalRequests:0,paidModelCalls:0};
await mkdir('output/sprint9',{recursive:true});await writeFile('output/sprint9/shopping-http-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
