import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createJobQueue } from '../server/jobs.js';
const image='data:image/jpeg;base64,YQ==';

test('queue accepts immediately, serializes work and never returns photo bytes',async()=>{
  const releases=[];let calls=0;
  const queue=createJobQueue(()=>new Promise(resolve=>{calls++;releases.push(resolve);}));
  const a=queue.enqueue(image),b=queue.enqueue(image);
  assert.equal(a.status,'queued');assert.equal(calls,0);await tick();assert.equal(calls,1);
  assert.equal(queue.get(a.id).status,'processing');assert.equal(queue.get(b.id).status,'queued');assert.equal('image' in queue.get(a.id),false);
  releases.shift()({data:{category:'Top'}});await tick();assert.equal(calls,2);assert.equal(queue.get(a.id).status,'ready');
  releases.shift()({data:{category:'Bottom'}});await tick();assert.equal(queue.busy,false);
});
test('failed and cancelled jobs do not block the queue; late results stay cancelled',async()=>{
  let resolve,signal;
  const queue=createJobQueue((photo,options)=>{signal=options.signal;return new Promise(r=>{resolve=r;});});
  const job=queue.enqueue(image);await tick();queue.cancel(job.id);assert.equal(signal.aborted,true);resolve({data:{name:'late'}});await tick();
  assert.equal(queue.get(job.id).status,'cancelled');assert.equal(queue.get(job.id).result,undefined);assert.equal(queue.busy,false);
  const failing=createJobQueue(async()=>{throw new Error('No garment found');});const bad=failing.enqueue(image);await tick();assert.equal(failing.get(bad.id).status,'failed');assert.equal(failing.busy,false);
});
test('queue bounds pending photos, rejects malformed input and expires completed jobs',async()=>{
  let now=0,resolve;const queue=createJobQueue(()=>new Promise(r=>{resolve=r;}),{maxJobs:1,ttl:100,now:()=>now});
  assert.throws(()=>queue.enqueue('http://external.test/photo.jpg'),/valid/);
  const job=queue.enqueue(image);assert.throws(()=>queue.enqueue(image),/full/);await tick();resolve({data:{}});await tick();
  now=101;assert.equal(queue.get(job.id),undefined);
});

test('only transient failures retry, and stages and attempts are visible',async()=>{
  let attempts=0;
  const queue=createJobQueue(async(_,options)=>{options.onStage('preparing');if(++attempts===1)throw Object.assign(new Error('Temporary outage'),{retryable:true,code:'MODEL_UNAVAILABLE'});options.onStage('validating');return {data:{}};},{retryDelayMs:1});
  const job=queue.enqueue(image);await sleep(25);assert.equal(queue.get(job.id).status,'ready');assert.equal(queue.get(job.id).attempt,2);assert.equal(attempts,2);
  const rejected=createJobQueue(async()=>{throw Object.assign(new Error('Not fashion'),{code:'NOT_FASHION',retryable:false});},{retryDelayMs:1});const no=rejected.enqueue(image);await tick();assert.equal(rejected.get(no.id).attempt,1);assert.equal(rejected.get(no.id).errorCode,'NOT_FASHION');
});
test('cancelling during backoff prevents another attempt and releases the queue',async()=>{
  let calls=0;const queue=createJobQueue(async()=>{calls++;throw Object.assign(new Error('Unavailable'),{retryable:true});},{retryDelayMs:1000});
  const job=queue.enqueue(image);await tick();assert.equal(queue.get(job.id).stage,'retrying');queue.cancel(job.id);await tick();assert.equal(calls,1);assert.equal(queue.busy,false);assert.equal(queue.get(job.id).status,'cancelled');
});

test('cloud recognition has two independent slots while local work remains serialized',async t=>{
  const started=[],releases=new Map();
  const queue=createJobQueue((_,options)=>new Promise(resolve=>{started.push(options.wardrobeId);releases.set(options.wardrobeId,resolve);}));
  t.after(()=>queue.close());
  const enqueue=(wardrobeId,provider='local')=>queue.enqueue(image,{wardrobeId,provider});
  const local1=enqueue('local-1'),local2=enqueue('local-2'),cloud1=enqueue('cloud-1','openai'),cloud2=enqueue('cloud-2','openai'),cloud3=enqueue('cloud-3','openai');
  await tick();
  assert.deepEqual(started,['local-1','cloud-1','cloud-2']);assert.equal(queue.activeLocalCount,1);assert.equal(queue.activeCloudCount,2);
  assert.equal(queue.get(local2.id).status,'queued');assert.equal(queue.get(cloud3.id).status,'queued');assert.equal(queue.get(local2.id).position,1);assert.equal(queue.get(cloud3.id).position,1);
  releases.get('cloud-1')({data:{name:'Cloud response'}});await tick();
  assert.equal(queue.get(cloud1.id).status,'ready');assert.equal(queue.get(cloud3.id).status,'processing');assert.equal(queue.get(local1.id).status,'processing');assert.equal(queue.get(local2.id).status,'queued');assert.equal(queue.activeCloudCount,2);
  releases.get('cloud-2')({});releases.get('cloud-3')({});await tick();assert.equal(queue.cloudBusy,false);assert.equal(queue.localBusy,true);
  releases.get('local-1')({});await tick();assert.equal(queue.get(local2.id).status,'processing');assert.equal(queue.activeLocalCount,1);
  releases.get('local-2')({});await tick();assert.equal(queue.busy,false);assert.equal(queue.get(cloud2.id).status,'ready');
});

test('cancelled cloud jobs retain capacity until settlement and late results never overwrite cancellation',async t=>{
  const calls=[];
  const queue=createJobQueue((_,options)=>new Promise(resolve=>calls.push({resolve,signal:options.signal,scope:options.wardrobeId})));
  t.after(()=>queue.close());
  const first=queue.enqueue(image,{provider:'openai',wardrobeId:'one'}),second=queue.enqueue(image,{provider:'openai',wardrobeId:'two'}),third=queue.enqueue(image,{provider:'openai',wardrobeId:'three'});
  await tick();assert.equal(calls.length,2);
  queue.cancel(first.id);assert.equal(calls[0].signal.aborted,true);await tick();assert.equal(calls.length,2);assert.equal(queue.get(third.id).status,'queued');assert.equal(queue.activeCloudCount,2);
  calls[0].resolve({data:{name:'Late'}});await tick();assert.equal(calls.length,3);assert.equal(queue.get(first.id).status,'cancelled');assert.equal(queue.get(first.id).result,undefined);assert.equal(queue.activeCloudCount,2);
  calls[1].resolve({});calls[2].resolve({});await tick();assert.equal(queue.get(second.id).status,'ready');assert.equal(queue.get(third.id).status,'ready');assert.equal(queue.cloudBusy,false);
});

test('cloud concurrency configuration cannot exceed the provider limit',()=>{
  for(const cloudConcurrency of [0,3,-1,1.5,NaN])assert.throws(()=>createJobQueue(async()=>({}),{cloudConcurrency}),/Cloud recognition concurrency/);
});
