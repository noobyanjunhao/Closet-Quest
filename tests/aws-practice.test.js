import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createHandler}=createRequire(import.meta.url)('../infra/aws/practice/catalog.cjs');
function memory(){let row,calls=0,writes=0;return {get calls(){return calls;},get writes(){return writes;},async send(cmd,{abortSignal}){assert.ok(abortSignal);calls++;if(cmd.constructor.name==='GetItemCommand')return {Item:row};if(row&&Number(row.expiresAt.N)>Number(cmd.input.ExpressionAttributeValues[':now'].N))throw Object.assign(Error('conflict'),{name:'ConditionalCheckFailedException'});row=cmd.input.Item;writes++;return {};}};}
test('practice handler caches synthetic garments, rejects unexpected inputs before IO, and refreshes expired records',async()=>{
 let now=1000000;const client=memory(),logs=[],handler=createHandler({client,table:'Practice',now:()=>now,log:s=>logs.push(JSON.parse(s))});
 assert.equal((await handler({category:'Top'})).cached,false);
 assert.equal((await handler({category:'Top'})).cached,true);assert.equal(client.writes,1);
 const before=client.calls;await assert.rejects(handler({category:'__proto__'}));await assert.rejects(handler({category:'Top',photo:'private'}));assert.equal(client.calls,before);
 now+=901000;assert.equal((await handler({category:'Top'})).cached,false);assert.equal(client.writes,2);
 assert.deepEqual(Object.keys(logs[0]).sort(),['cached','category','elapsedMs','event','reusedAfterRace']);
});
test('practice conditional writes preserve one synthetic refresh across independent handlers',async()=>{
 const client=memory(),a=createHandler({client,table:'Practice'}),b=createHandler({client,table:'Practice'});
 const results=await Promise.all(Array.from({length:10},(_,i)=>(i%2?a:b)({category:'Shoes'})));
 assert.equal(client.writes,1);assert.equal(results.filter(r=>!r.cached).length,1);assert.ok(results.every(r=>r.synthetic));
});
test('practice datastore failures stay explicit rather than becoming successful cached results',async()=>{
 const h=createHandler({table:'Practice',client:{send:async()=>{throw Error('unavailable');}}});
 await assert.rejects(h({category:'Bottom'}),/unavailable/);
});
