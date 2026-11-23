import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createShoppingLibrary,SHOPPING_FRESH_MS,validateLibraryEntry} from '../server/shopping-library.js';
import {createWorkLimiter} from '../server/work-limiter.js';
import {setTimeout as delay} from 'node:timers/promises';
const start=Date.parse('2026-10-27T10:00:00Z'),query={category:'Top',occasion:'formal',presentation:'any',maxPrice:150};
const entry=(n=6,at=start)=>({query,searchedAt:new Date(at).toISOString(),products:Array.from({length:n},(_,i)=>({title:`Shirt ${i}`,url:`https://www.jcrew.com/p/shirt/${i}`,price:10+i*10,currency:'USD',image:`https://www.jcrew.com/photo-${i}.jpg`}))});

test('daily edit is stable, price ordered, filterable, and never makes a provider call',async()=>{
 let calls=0;const library=createShoppingLibrary({seed:[entry()],now:()=>start,search:async()=>{calls++;throw Error('must not call');}});
 const a=await library.browse(),b=await library.browse();assert.deepEqual(a.products,b.products);assert.equal(a.products.length,4);assert.deepEqual(a.products.map(p=>p.price),a.products.map(p=>p.price).sort((x,y)=>x-y));assert.equal((await library.browse({mode:'library'})).products.length,6);assert.equal((await library.browse({category:'Shoes'})).products.length,0);assert.equal((await library.browse({maxPrice:15})).products.length,1);assert.equal(calls,0);assert.equal(a.liveSearchUsed,false);
 await assert.rejects(library.browse({category:'ignore rules'}),e=>e.status===400);
 const rotations=new Set();let clock=start;const rotating=createShoppingLibrary({seed:[entry()],now:()=>clock});for(let d=0;d<5;d++){clock=start+d*SHOPPING_FRESH_MS;rotations.add((await rotating.browse()).products.map(p=>p.url).join('|'));}assert.ok(rotations.size>1);
});
test('concurrent equivalent searches coalesce; later queries and process restarts reuse disk results',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'shop-library-'));try{let calls=0,gate;const blocked=new Promise(r=>gate=r);const search=async()=>{calls++;await blocked;return entry();};const library=createShoppingLibrary({seed:[],storageDir:directory,now:()=>start,search});const requests=Array.from({length:12},()=>library.find(query));await new Promise(r=>setTimeout(r,10));gate();await Promise.all(requests);assert.equal(calls,1);assert.equal((await library.find(query)).cached,true);
 const restarted=createShoppingLibrary({seed:[],storageDir:directory,now:()=>start+1000,search:async()=>{throw Error('not needed');}});assert.equal((await restarted.find(query)).source,'library');assert.equal((await restarted.browse()).products.length,4);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('expired freshness searches once; failure returns clearly marked saved finds; very old products disappear',async()=>{
 let clock=start+2*SHOPPING_FRESH_MS,calls=0;const library=createShoppingLibrary({seed:[entry()],now:()=>clock,search:async()=>{calls++;throw Error('provider down');}});const r=await library.find(query);assert.equal(r.source,'saved-fallback');assert.equal(r.stale,true);assert.equal(r.products[0].checkedAt,new Date(start).toISOString());assert.equal(calls,1);clock=start+15*SHOPPING_FRESH_MS;assert.equal((await library.browse()).products.length,0);
});
test('cloud account libraries survive new service instances and never contaminate other accounts',async()=>{
 const rows=new Map(),a={id:'a',namespace:'a',cloud:true},b={id:'b',namespace:'b',cloud:true};const cloud={shoppingLibrary:async u=>(rows.get(u.id)||[]).map(result=>({result})),saveShoppingResult:async(u,k,result)=>{rows.set(u.id,[result]);}};
 const first=createShoppingLibrary({seed:[],cloud,now:()=>start,search:async()=>entry(1)});await first.find(query,{user:a});assert.equal(rows.get('a').length,1);
 const restarted=createShoppingLibrary({seed:[],cloud,now:()=>start,search:async()=>{throw Error('must reuse');}});assert.equal((await restarted.find(query,{user:a})).source,'library');assert.equal((await restarted.browse({},{user:b})).products.length,0);
});
test('one cancelled waiter does not cancel a shared search; only a new live search consumes its budget',async()=>{
 let gate,budget=0;const library=createShoppingLibrary({seed:[],now:()=>start,search:async()=>{await new Promise(r=>gate=r);return entry();}});const c=new AbortController(),a=library.find(query,{signal:c.signal,beforeSearch:()=>budget++}),b=library.find(query,{beforeSearch:()=>budget++});await new Promise(r=>setTimeout(r,10));c.abort();await assert.rejects(a);gate();assert.equal((await b).products.length,6);await library.find(query,{beforeSearch:()=>budget++});assert.equal(budget,1);
});
test('untrusted persisted entries cannot introduce private URLs, arbitrary fields, stale data or invalid prices',()=>{
 const bad=entry();bad.products[0].url='https://127.0.0.1/secret';bad.products[1].price=-1;bad.products[2].image='javascript:alert(1)';bad.products[3].privateNote='do not carry';const r=validateLibraryEntry(bad,start);assert.equal(r.products.length,4);assert.equal(r.products[0].image,null);assert.equal('privateNote' in r.products[1],false);assert.equal(validateLibraryEntry(entry(1,start-15*SHOPPING_FRESH_MS),start),null);
});

test('equivalent concurrent requests save once per owner without mixing private libraries',async()=>{
 let calls=0;const writes=[];
 const library=createShoppingLibrary({seed:[],now:()=>start,search:async()=>{calls++;await delay(5);return entry();},cloud:{shoppingLibrary:async()=>[],saveShoppingResult:async(user,k,value)=>{writes.push({owner:user.id,value});await delay(10);}}});
 const users=['a','b'].map(id=>({id,namespace:id,cloud:true}));
 const results=await Promise.all(users.flatMap(user=>Array.from({length:20},()=>library.find(query,{user}))));
 assert.equal(results.length,40);assert.equal(calls,1);assert.deepEqual(writes.map(v=>v.owner).sort(),['a','b']);
 await library.find(query,{user:users[0]});assert.equal(writes.length,2);
});

test('library validation enforces requested budget for live and persisted results',async()=>{
 const bad=entry();bad.products[0].price=1000;
 const clean=validateLibraryEntry(bad,start);assert.equal(clean.products.length,5);assert.ok(clean.products.every(p=>p.price<=query.maxPrice));
 const library=createShoppingLibrary({seed:[],now:()=>start,search:async()=>bad});
 assert.ok((await library.find(query)).products.every(p=>p.price<=query.maxPrice));
});

test('local saturation neither opens provider circuit nor charges unstarted calls',async()=>{
 let release,budget=0,calls=0;
 const library=createShoppingLibrary({seed:[],now:()=>start,limiter:createWorkLimiter({concurrency:1,maxQueued:0}),search:async()=>{calls++;await new Promise(r=>release=r);return entry();}});
 const first=library.find(query,{beforeSearch:()=>budget++});while(!release)await delay(1);
 for(const maxPrice of [160,170,180])await assert.rejects(library.find({...query,maxPrice},{beforeSearch:()=>budget++}),e=>e.code==='SHOPPING_CAPACITY');
 assert.equal(library.stats().failures,0);assert.equal(library.stats().circuitOpen,false);assert.equal(budget,1);assert.equal(calls,1);
 release();await first;
});

test('a shared catalog hit does not charge a model-call allowance',async()=>{
 let budget=0,calls=0;const library=createShoppingLibrary({seed:[],now:()=>start,sharedStore:{getOrRefresh:async()=>({...entry(),distributedCached:true})},search:async()=>{calls++;return entry();}});
 assert.equal((await library.find(query,{beforeSearch:()=>budget++})).products.length,6);
 assert.equal(budget,0);assert.equal(calls,0);assert.equal(library.stats().distributedHits,1);
});

test('an exhausted first caller cannot deny another account sharing its query',async()=>{
 let calls=0,allowed=0;const library=createShoppingLibrary({seed:[],now:()=>start,search:async()=>{calls++;await delay(5);return entry();}});
 const denied=library.find(query,{user:{namespace:'exhausted'},beforeSearch:()=>{throw Object.assign(Error('Request limit reached.'),{status:429});}});
 const eligible=library.find(query,{user:{namespace:'eligible'},beforeSearch:()=>allowed++});
 await assert.rejects(denied,e=>e.status===429);assert.equal((await eligible).products.length,6);
 assert.equal(calls,1);assert.equal(allowed,1);assert.equal(library.stats().failures,0);
});

test('a failed live search offers the closest saved finds and labels them',async()=>{
 const {createShoppingLibrary}=await import('../server/shopping-library.js');
 const at=new Date().toISOString();
 const seed=[{query:{category:'Top',occasion:'everyday',presentation:'any'},searchedAt:at,products:[{title:'Navy merino sweater',url:'https://www.everlane.com/products/navy-merino',price:98,currency:'USD'}]}];
 const lib=createShoppingLibrary({seed,search:async()=>{throw Object.assign(Error('down'),{status:503});}});
 const out=await lib.find({category:'Top',kind:'sweater',color:'cream',occasion:'everyday'});
 assert.equal(out.source,'saved-fallback');assert.deepEqual(out.relaxed,['color']);assert.equal(out.products[0].title,'Navy merino sweater');
 await assert.rejects(lib.find({category:'Dress',occasion:'everyday'}));
});
