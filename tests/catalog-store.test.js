import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogStore,createDynamoTransport} from '../server/catalog-store.js';
import {refreshCatalog} from '../infra/aws/catalog-refresh.mjs';
import {setTimeout as delay} from 'node:timers/promises';
const query={category:'Top',occasion:'formal',presentation:'any',maxPrice:null};
const entry=(q=query,now=Date.now())=>({query:q,searchedAt:new Date(now).toISOString(),products:[{title:'Tee',url:'https://www.jcrew.com/p/tee/ABC',price:25,currency:'USD'}]});
function transport(){
 const rows=new Map();return {rows,async get(k){return rows.get(k);},async claim(k,token,now,ms){const old=rows.get(k)||{};if(old.leaseUntil>=now)return false;rows.set(k,{...old,token,leaseUntil:now+ms});return true;},async commit(k,token,value,now,ttl){const row=rows.get(k);if(row?.token!==token||row.leaseUntil<now)throw Error('lease lost');rows.set(k,{value,ttl});},async release(k,token){const row=rows.get(k);if(row?.token===token){delete row.token;delete row.leaseUntil;}}};
}
test('two independent catalog clients share a conditional lease and one refresh',async()=>{
 const t=transport(),a=createCatalogStore({transport:t}),b=createCatalogStore({transport:t});let calls=0;
 const refresh=async()=>{calls++;await delay(20);return entry();};
 const results=await Promise.all([a.getOrRefresh(query,refresh),b.getOrRefresh(query,refresh)]);assert.equal(calls,1);assert.equal(results[1].distributedCached,true);
 assert.ok(!JSON.stringify([...t.rows]).includes('wardrobe'));
});
test('expired retained data is never trusted just because DynamoDB TTL has not deleted it',async()=>{
 let now=Date.now(),calls=0;const t=transport(),store=createCatalogStore({transport:t,now:()=>now});
 await store.getOrRefresh(query,async()=>{calls++;return entry(query,now);});now+=15*86400000;
 await store.getOrRefresh(query,async()=>{calls++;return entry(query,now);});assert.equal(calls,2);
});

test('catalog rechecks data published between its initial miss and lease acquisition',async()=>{
 const t=transport(),claim=t.claim;let calls=0;
 t.claim=async(...args)=>{const ok=await claim(...args);t.rows.get(args[0]).value=entry();return ok;};
 const result=await createCatalogStore({transport:t}).getOrRefresh(query,async()=>{calls++;return entry();});
 assert.equal(calls,0);assert.equal(result.distributedCached,true);assert.equal([...t.rows.values()].filter(r=>r.token).length,0);
});
test('lease fencing rejects a slow obsolete writer and failure releases its own lease',async()=>{
 const t=transport();await t.claim('key','old',0,10);assert.equal(await t.claim('key','new',11,10),true);
 await assert.rejects(t.commit('key','old',entry(),12,20));await t.release('key','old');assert.equal(t.rows.get('key').token,'new');
 const store=createCatalogStore({transport:t});await assert.rejects(store.getOrRefresh(query,async()=>{throw Error('down');}));assert.equal([...t.rows.values()].filter(r=>r.token&&r.token!=='new').length,0);
});
test('DynamoDB adapter uses consistent reads, atomic lease conditions, bounded IO and fencing',async()=>{
 const calls=[],commands=Object.fromEntries(['GetItemCommand','UpdateItemCommand'].map(name=>[name,class{constructor(input){this.name=name;this.input=input;}}]));
 const client={send:async(c,o)=>{calls.push(c);assert.ok(o.abortSignal);return {};}};
 const t=createDynamoTransport({client,commands,table:'Catalog'});await t.get('key');await t.claim('key','token',100,50);await t.commit('key','token',entry(),110,999);await t.release('key','token');
 assert.equal(calls[0].input.ConsistentRead,true);assert.match(calls[1].input.ConditionExpression,/leaseUntil < :now/);assert.match(calls[2].input.ConditionExpression,/leaseToken = :token AND leaseUntil >= :now/);assert.equal(calls[3].input.ConditionExpression,'leaseToken = :token');
});
test('scheduled worker minimizes data, uses stable daily query, and caches repeats',async()=>{
 let calls=0;const store=createCatalogStore({transport:transport()});const opts={store,search:async q=>{calls++;assert.deepEqual(Object.keys(q).sort(),['category','maxPrice','occasion','presentation']);return entry(q);}};
 const a=await refreshCatalog(opts),b=await refreshCatalog(opts);assert.equal(calls,1);assert.equal(a.products,1);assert.equal(b.cached,true);
});

