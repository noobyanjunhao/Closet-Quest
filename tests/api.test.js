import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, readdirSync, lstatSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { once } from 'node:events';
import { setImmediate as tick } from 'node:timers/promises';
import { createApi } from '../server/api.js';
import { createLocalServer } from '../server/start.mjs';
import { modelFor } from '../server/model-config.js';

const image='data:image/jpeg;base64,YQ==';
function services(overrides={}) {
  return {
    recognize:async()=>({data:{name:'Reviewed tee',category:'Top'}}),
    style:async()=>({data:{outfits:[],reason:'No complete combination'}}),
    retrieveWardrobeHybrid:async()=>({retrieval:{items:[],retrievedCount:0,eligibleCount:0,guidance:[]}}),
    listModels:async()=>({models:['recognition','stylist','embedding'].map(role=>({name:modelFor(role)}))}),
    getLearningStatus:async()=>({examples:0}),
    exportLearningData:async()=>({events:[]}),
    recordLearningEvent:async body=>({accepted:true,type:body.type}),
    ...overrides,
  };
}
function workspace(t) {
  const root=mkdtempSync(join(tmpdir(),'closet-api-test-')),jobs=join(root,'jobs'),dist=join(root,'dist'),closers=[];
  mkdirSync(jobs);mkdirSync(dist);writeFileSync(join(dist,'index.html'),'<!doctype html><title>Closet test</title><main>Test wardrobe</main>');writeFileSync(join(dist,'app.js'),'export const test=true;');writeFileSync(join(root,'secret.txt'),'must stay private');
  t.after(async()=>{
    for(const close of closers)await close();
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));
    for(const directory of [jobs,dist]) {
      assert.equal(dirname(resolve(directory)),resolve(root));
      for(const name of readdirSync(directory)){const target=resolve(directory,name);assert.equal(dirname(target),resolve(directory));assert.ok(lstatSync(target).isFile()||lstatSync(target).isSymbolicLink());unlinkSync(target);}
      rmdirSync(directory);
    }
    unlinkSync(join(root,'secret.txt'));rmdirSync(root);
  });
  return {root,jobs,dist,closers};
}
async function mount(t,space,{overrides={},queueOptions={}}={}) {
  const api=createApi({storageDir:space.jobs,services:services(overrides),queueOptions});
  const server=http.createServer(api.middleware);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const close=async()=>{api.close();if(!server.listening)return;const closed=once(server,'close');server.close();server.closeAllConnections();await closed;};
  space.closers.push(close);
  return {api,server,close,url:`http://127.0.0.1:${server.address().port}`};
}
const post=(url,body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
async function chunked(url,path,chunks) {
  return new Promise((resolve,reject)=>{
    const request=http.request(`${url}${path}`,{method:'POST',headers:{'Content-Type':'application/json','Transfer-Encoding':'chunked'}},response=>{const parts=[];response.on('data',chunk=>parts.push(chunk));response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(Buffer.concat(parts).toString())}));});
    request.on('error',reject);for(const chunk of chunks)request.write(chunk);request.end();
  });
}
async function requestWithHost(url,host) {
  return new Promise((resolve,reject)=>{const request=http.get(`${url}/status`,{headers:{Host:host}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);});
}

test('HTTP API enforces local same-origin access and provides model status without live inference',async t=>{
  const space=workspace(t),app=await mount(t,space);
  const status=await fetch(`${app.url}/status?fresh=1`);assert.equal(status.status,200);assert.match(status.headers.get('content-type'),/application\/json/);assert.equal(status.headers.get('cache-control'),'no-store');
  const body=await status.json();assert.equal(body.ready,true);assert.equal(body.embeddingReady,true);assert.equal(body.durableJobs,true);assert.equal(body.busy,false);
  assert.equal((await fetch(`${app.url}/status`,{headers:{Origin:'https://untrusted.test'}})).status,403);
  assert.equal(await requestWithHost(app.url,'external.example:9000'),403);
  assert.equal((await fetch(`${app.url}/status`,{headers:{Origin:app.url}})).status,200);
  assert.equal((await fetch(`${app.url}/unknown`)).status,404);
  const learning=await post(`${app.url}/learning/events`,{type:'test-only'});assert.equal(learning.status,201);assert.equal((await learning.json()).accepted,true);
  assert.deepEqual(await (await fetch(`${app.url}/learning/export`)).json(),{events:[]});
});

test('malformed, wrong-content-type, invalid crop and oversized requests fail before their handler',async t=>{
  const space=workspace(t);let recognized=0,learned=0;
  const app=await mount(t,space,{overrides:{recognize:async()=>{recognized++;return {};},recordLearningEvent:async()=>{learned++;return {};}}});
  for(const body of ['{broken','null','[]'])assert.equal((await post(`${app.url}/jobs`,body)).status,400);
  assert.equal((await post(`${app.url}/jobs`,{image},{'Content-Type':'application/jsonp'})).status,400);
  assert.equal((await post(`${app.url}/jobs`,{image,crop:{x:.9,y:0,width:.9,height:1}})).status,400);
  const large=JSON.stringify({padding:'x'.repeat(129000)});
  assert.equal((await post(`${app.url}/learning/events`,large)).status,413);
  const streamed=await chunked(app.url,'/learning/events',[large.slice(0,70000),large.slice(70000)]);assert.equal(streamed.status,413);assert.match(streamed.body.error,/too large/);
  assert.equal(recognized,0);assert.equal(learned,0);
  assert.equal((await fetch(`${app.url}/status`)).status,200,'Rejected uploads do not wedge the API.');
});

test('HTTP jobs acknowledge durable IDs, resume after server restart, and preserve normalized crop',async t=>{
  const space=workspace(t),crop={x:.1,y:.2,width:.6,height:.5};let received;
  const first=await mount(t,space,{overrides:{recognize:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))}});
  const accepted=await post(`${first.url}/jobs`,{image,crop});assert.equal(accepted.status,202);const job=await accepted.json();assert.equal(job.status,'queued');assert.deepEqual(job.crop,crop);assert.equal(JSON.stringify(job).includes(image),false);
  await first.close();
  const second=await mount(t,space,{overrides:{recognize:async(photo,options)=>{received={photo,crop:options.crop};return {data:{name:'Recovered tee'},image:photo};}}});
  const recovered=await (await fetch(`${second.url}/jobs/${job.id}`)).json();assert.equal(recovered.status,'ready');assert.equal(recovered.result.data.name,'Recovered tee');assert.deepEqual(received,{photo:image,crop});assert.equal(JSON.stringify(recovered).includes(image),false);
  assert.equal(readdirSync(space.jobs).some(name=>name.endsWith('.photo')),false);
});

test('busy inference is serialized while retrieval remains available; cancellation reaches the worker',async t=>{
  const space=workspace(t);let aborted=0,retrieved=0;
  const app=await mount(t,space,{queueOptions:{maxJobs:2},overrides:{recognize:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted++;reject(options.signal.reason);},{once:true})),retrieveWardrobeHybrid:async()=>{retrieved++;return {retrieval:{items:[]}};}}});
  const first=await (await post(`${app.url}/jobs`,{image})).json(),second=await (await post(`${app.url}/jobs`,{image})).json();
  assert.equal((await post(`${app.url}/style`,{provider:'local'})).status,429);
  assert.equal((await post(`${app.url}/style`,{provider:'quick'})).status,200,'Quick styling does not wait for camera recognition.');
  assert.equal((await post(`${app.url}/recognize`,{image})).status,429);
  assert.equal((await post(`${app.url}/jobs`,{image})).status,429);
  assert.equal((await post(`${app.url}/retrieve`,{items:[]})).status,200);assert.equal(retrieved,1);
  assert.equal((await fetch(`${app.url}/jobs/${first.id}`,{method:'DELETE'})).status,200);
  assert.equal((await fetch(`${app.url}/jobs/${second.id}`,{method:'DELETE'})).status,200);
  assert.ok(aborted>=1);
  for(const job of [first,second])assert.equal((await (await fetch(`${app.url}/jobs/${job.id}`)).json()).status,'cancelled');
  assert.equal((await fetch(`${app.url}/jobs/not-a-job`,{method:'DELETE'})).status,404);
});

test('disconnecting a direct styling request aborts inference and releases its busy state',async t=>{
  const space=workspace(t);let started,observedAbort,calls=0;
  const began=new Promise(resolve=>{started=resolve;}),aborted=new Promise(resolve=>{observedAbort=resolve;});
  const app=await mount(t,space,{overrides:{style:async(_,options)=>{if(++calls>1)return {data:{outfits:[]}};started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{observedAbort();reject(options.signal.reason);},{once:true}));}}});
  const controller=new AbortController();
  const pending=fetch(`${app.url}/style`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal}).catch(error=>error);
  await began;controller.abort();await aborted;await pending;await tick();
  assert.equal((await post(`${app.url}/style`,{})).status,200);assert.equal(calls,2);
});

test('standalone server serves the built app and API together but cannot serve private paths',async t=>{
  const space=workspace(t),server=await createLocalServer({distDir:space.dist,apiOptions:{storageDir:space.jobs,services:services()}});
  space.closers.push(()=>server.shutdown());server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
  const html=await fetch(url);assert.equal(html.status,200);assert.match(await html.text(),/Test wardrobe/);assert.equal(html.headers.get('cache-control'),'no-cache');
  const head=await fetch(`${url}/app.js`,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.ok(Number(head.headers.get('content-length'))>0);assert.equal(head.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await fetch(`${url}/api/status`)).status,200);
  assert.deepEqual(await (await fetch(`${url}/api/learning/status`)).json(),{examples:0});
  assert.equal((await fetch(`${url}/%2e%2e%2fsecret.txt`)).status,403);
  assert.equal((await fetch(`${url}/.local-data/jobs/private.photo`)).status,403);
  assert.equal((await fetch(`${url}/%ZZ`)).status,400);
  assert.equal((await fetch(`${url}/missing.js`)).status,404);
  assert.equal((await post(`${url}/index.html`,{})).status,405);
  await assert.rejects(createLocalServer({distDir:space.dist,apiOptions:{storageDir:space.jobs,services:services()}}),error=>error.code==='JOB_STORE_IN_USE');
  assert.equal((await fetch(`${url}/api/status`)).status,200,'A conflicting owner cannot disrupt the running server.');
});
