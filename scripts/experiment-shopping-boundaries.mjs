// No credentials, network, retailer traffic or model calls: exercise real library boundaries.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createShoppingLibrary} from '../server/shopping-library.js';
import {createWorkLimiter} from '../server/work-limiter.js';

const stage=process.argv[2];
if(!['before','after'].includes(stage))throw Error('Specify before or after.');
const query={category:'Top',occasion:'formal',presentation:'any',maxPrice:50};
const entry=q=>({query:q,searchedAt:new Date().toISOString(),products:[{title:'Synthetic shirt',url:'https://www.jcrew.com/p/shirt/FIXTURE',price:40,currency:'USD'}]});

let writes=0,providerCalls=0;
const sameAccount=createShoppingLibrary({seed:[],search:async q=>{providerCalls++;await delay(10);return entry(q);},cloud:{shoppingLibrary:async()=>[],saveShoppingResult:async()=>{writes++;await delay(20);}}});
const cloudStart=performance.now();
const cloudResults=await Promise.all(Array.from({length:40},()=>sameAccount.find(query,{user:{cloud:true,id:'synthetic-a',namespace:'synthetic-a'}})));
const cloudSave={requests:40,successful:cloudResults.length,providerCalls,cloudWrites:writes,elapsedMs:Number((performance.now()-cloudStart).toFixed(2))};

const budgetLibrary=createShoppingLibrary({seed:[],search:async q=>({...entry(q),products:[...entry(q).products,{title:'Synthetic expensive shirt',url:'https://www.jcrew.com/p/shirt/EXPENSIVE',price:500,currency:'USD'}]})});
const budgetResult=await budgetLibrary.find(query);
const budget={maximum:50,returnedPrices:budgetResult.products.map(p=>p.price),overBudget:budgetResult.products.filter(p=>p.price>50).length};

let release,budgetChecks=0,capacityProviderCalls=0;
const capacityLibrary=createShoppingLibrary({seed:[],limiter:createWorkLimiter({concurrency:1,maxQueued:0,waitMs:100}),search:async q=>{capacityProviderCalls++;await new Promise(r=>release=r);return entry(q);}});
const active=capacityLibrary.find(query,{beforeSearch:()=>budgetChecks++});
while(!release)await delay(1);
const refusals=await Promise.all([60,70,80].map(maxPrice=>capacityLibrary.find({...query,maxPrice},{beforeSearch:()=>budgetChecks++}).then(()=>null,e=>({status:e.status,code:e.code}))));
const during=capacityLibrary.stats();release();await active;
const capacity={refusals,budgetChecks,providerCalls:capacityProviderCalls,providerFailures: during.failures,circuitOpen: during.circuitOpen};

const results={measuredAt:new Date().toISOString(),stage,kind:'Synthetic in-process boundary experiment; no external services',cloudSave,budget,capacity,requests:{realUserSessions:0,paidModelCalls:0,retailerRequests:0}};
if(stage==='before'){
 assert.equal(cloudSave.cloudWrites,40);assert.equal(budget.overBudget,1);
 assert.equal(capacity.providerFailures,3);assert.equal(capacity.circuitOpen,true);assert.equal(capacity.budgetChecks,4);
}
if(stage==='after'){
 assert.equal(cloudSave.cloudWrites,1);assert.equal(cloudSave.providerCalls,1);assert.equal(budget.overBudget,0);
 assert.equal(capacity.providerFailures,0);assert.equal(capacity.circuitOpen,false);assert.equal(capacity.budgetChecks,1);
 assert.equal(refusals.filter(r=>r.code==='SHOPPING_CAPACITY').length,3);
}
await mkdir('output/sprint9',{recursive:true});
await writeFile(`output/sprint9/shopping-boundaries-${stage}.json`,JSON.stringify(results,null,2)+'\n',stage==='before'?{flag:'wx'}:{});
console.log(JSON.stringify(results,null,2));
