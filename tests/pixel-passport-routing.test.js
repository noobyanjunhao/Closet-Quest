import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createLocalServer} from '../server/start.mjs';
import {createEventAvatar} from '../server/event-avatar.js';

const ENTRY='<!doctype html><title>fixture entry</title><div id="root"></div>';
async function start(t){
  const directory=await mkdtemp(join(tmpdir(),'closet-event-route-')),dist=join(directory,'dist');
  await mkdir(join(dist,'assets'),{recursive:true});await writeFile(join(dist,'index.html'),ENTRY);await writeFile(join(dist,'assets','app.js'),'console.log(1)');
  const server=await createLocalServer({distDir:dist,apiOptions:{storageDir:join(directory,'data')},eventAvatar:createEventAvatar({env:{}})});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await server.shutdown();await rm(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  return (path,method='GET')=>new Promise((resolve,reject)=>{const request=http.request(base+path,{method,headers:{host:new URL(base).host}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body}));});request.on('error',reject);request.end();});
}

test('the two exact event paths serve the entry HTML directly, with query strings and on refresh',async t=>{
  const req=await start(t);
  for(const path of ['/event/pixel-passport','/event/pixel-passport/','/event/pixel-passport?utm_source=qr&x=1','/event/pixel-passport/?a=b','/event/pixel%2Dpassport']){
    for(let refresh=0;refresh<2;refresh++){
      const response=await req(path);assert.equal(response.status,200,path);assert.equal(response.body,ENTRY);
      assert.match(response.headers['content-type'],/^text\/html/);assert.equal(response.headers['cache-control'],'no-cache');
      assert.equal(response.headers['x-content-type-options'],'nosniff');assert.equal(response.headers['x-frame-options'],'DENY');assert.equal(response.headers['referrer-policy'],'same-origin');
      assert.equal(response.headers['permissions-policy'],'camera=(self), microphone=(), geolocation=()');
    }
    const head=await req(path,'HEAD');assert.equal(head.status,200);assert.equal(head.body,'');assert.equal(head.headers['content-length'],String(Buffer.byteLength(ENTRY)));assert.match(head.headers['content-type'],/^text\/html/);
    for(const method of ['POST','PUT','DELETE'])assert.equal((await req(path,method)).status,405,`${method} ${path}`);
  }
});

test('there is no catch-all: other paths, missing assets and private API routes keep failing',async t=>{
  const req=await start(t);
  for(const path of ['/event','/event/','/event/other','/event/pixel-passport/extra','/event/pixel-passport//','/event/Pixel-Passport','/events/pixel-passport','/pixel-passport','/event/pixel-passport.html','/assets/missing.js','/nope']){
    const response=await req(path);assert.equal(response.status,404,path);assert.doesNotMatch(response.body,/fixture entry/);
  }
  assert.equal((await req('/event/%E0%A4%A')).status,400);
  assert.equal((await req('/')).body,ENTRY);assert.equal((await req('/index.html')).body,ENTRY);
  const asset=await req('/assets/app.js');assert.equal(asset.status,200);assert.equal(asset.headers['cache-control'],'public, max-age=3600');
  assert.equal((await req('/healthz')).body,'ok');
  for(const path of ['/api/status','/api/cloud/closet','/api/event/pixel-passport','/api/nope']){const response=await req(path);assert.doesNotMatch(response.body,/fixture entry/,path);assert.doesNotMatch(response.headers['content-type']||'',/html/,path);}
  assert.equal((await req('/api/event/pixel-passport')).status,404);assert.equal((await req('/api/event/pixel-passport/character/extra')).status,404);
  const status=await req('/api/event/pixel-passport/character?x=1');assert.equal(status.status,200);assert.deepEqual(JSON.parse(status.body),{available:false},'photo characters stay off without explicit configuration');
});

test('the event module tree is isolated from the account app, the private API and browser storage',async()=>{
  const root=join(dirname(fileURLToPath(import.meta.url)),'..','src');
  const files=(await readdir(join(root,'event'))).filter(name=>/\.(jsx?|css)$/.test(name));
  assert.ok(files.includes('PixelPassport.jsx'));
  for(const name of files){
    const source=await readFile(join(root,'event',name),'utf8');
    for(const match of source.matchAll(/from\s+'([^']+)'|import\s+'([^']+)'|import\('([^']+)'\)/g)){const target=match[1]||match[2]||match[3];assert.ok(target.startsWith('./')||['react'].includes(target),`${name} imports ${target}`);}
    // Only likeness.js may talk to the network, and only to the event's own route.
    if(name==='likeness.js'){assert.deepEqual([...source.matchAll(/'(\/api\/[^']*)'/g)].map(m=>m[1]),['/api/event/pixel-passport/character']);assert.match(source,/credentials: 'omit'/);assert.doesNotMatch(source,/credentials: '(include|same-origin)'/);}
    else assert.doesNotMatch(source,/\bfetch\s*\(|fetchImpl|\/api\//,name);
    assert.doesNotMatch(source,/XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|serviceWorker|document\.cookie|https?:\/\//,name);
  }
  const main=await readFile(join(root,'main.jsx'),'utf8');
  assert.doesNotMatch(main,/^import .*AccessGate/m,'the account app must stay behind a lazy import');
  assert.match(main,/import\('\.\/AccessGate\.jsx'\)/);assert.match(main,/import\('\.\/event\/PixelPassport\.jsx'\)/);
});
