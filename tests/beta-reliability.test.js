import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import sharp from 'sharp';
import {createWorkLimiter} from '../server/work-limiter.js';
import {createShoppingLibrary} from '../server/shopping-library.js';
import {assessPhotoQuality} from '../server/photo-quality.js';
const query={category:'Top',occasion:'formal',presentation:'any',maxPrice:null};
const entry=(q=query)=>({query:q,searchedAt:new Date().toISOString(),products:[{title:'Cotton shirt',url:'https://www.jcrew.com/p/shirt/ABC',price:40,currency:'USD'}]});
test('40 equivalent requests across accounts use one provider call',async()=>{
  let calls=0;const shop=createShoppingLibrary({seed:[],search:async q=>{calls++;await delay(20);return entry(q);}});
  const r=await Promise.all(Array.from({length:40},(_,i)=>shop.find(query,{user:{namespace:'p'+i}})));
  assert.equal(r.length,40);assert.equal(calls,1);assert.equal(shop.stats().coalesced,39);
});
test('40 distinct queries queue with peak two, and fresh repeated requests use no inference',async()=>{
  let calls=0;const shop=createShoppingLibrary({seed:[],search:async q=>{calls++;await delay(5);return entry(q);}});
  const results=await Promise.all(Array.from({length:40},(_,i)=>shop.find({...query,maxPrice:50+i})));
  assert.equal(results.length,40);assert.equal(calls,40);assert.equal(shop.stats().peak,2);
  await shop.find({...query,maxPrice:80});assert.equal(calls,40);
});
test('queue capacity and wait deadline are bounded; later work recovers',async()=>{
  let release;const limiter=createWorkLimiter({concurrency:1,maxQueued:1,waitMs:20});
  const first=limiter.run(()=>new Promise(r=>release=r));
  const second=limiter.run(()=>42);const rejected=assert.rejects(second,e=>e.code==='SHOPPING_CAPACITY');
  await assert.rejects(limiter.run(()=>3),e=>e.status===503);await rejected;release(1);await first;await delay(1);assert.equal(await limiter.run(()=>4),4);
});
test('negative cache prevents repeated paid failures and cooldown permits recovery',async()=>{
  let time=Date.now(),calls=0;const shop=createShoppingLibrary({seed:[],now:()=>time,search:async q=>{calls++;if(calls===1)throw Error('offline');return {...entry(q),searchedAt:new Date(time).toISOString()};}});
  await assert.rejects(shop.find(query));await assert.rejects(shop.find(query),e=>e.code==='SHOPPING_COOLDOWN');assert.equal(calls,1);
  time+=31000;assert.equal((await shop.find(query)).products.length,1);assert.equal(calls,2);
});
test('quality guidance identifies small dark input without fabricating correctness',async()=>{
  const bytes=await sharp({create:{width:160,height:100,channels:3,background:'#181818'}}).png().toBuffer();const q=await assessPhotoQuality(bytes,{width:160,height:100});
  assert.deepEqual(q.flags,['low-resolution','dark','soft-detail']);assert.equal(q.policy,'advisory-only');assert.equal(q.completeInventoryVerified,false);
});

