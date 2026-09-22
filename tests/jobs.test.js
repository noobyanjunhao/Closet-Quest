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
