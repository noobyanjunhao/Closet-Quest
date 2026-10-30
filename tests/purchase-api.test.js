import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApi} from '../server/api.js';
import {createAccess} from '../server/access.js';
import {purchaseFixtures} from './fixtures/purchase-import/cases.js';

test('HTTP imports: acknowledge async, strict edits, explicit commit, replay, cancellation and feature flag',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cq-import-http-'));const api=createApi({storageDir:dir,cloud:null,access:createAccess({origin:undefined}),purchaseOptions:{enabled:true,mode:'fixture'}});
 const server=http.createServer(api.middleware);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{api.close();await new Promise(r=>server.close(r));await delay(30);rmSync(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;
 const req=async(path,body,method=body?'POST':'GET',origin=base)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 assert.equal((await req('/imports/config')).data.enabled,true);
 assert.equal((await req('/imports',{text:'x'},'POST','https://evil.example')).status,403);
 assert.equal((await req('/imports',{text:''})).status,400);
 const input={source_type:'text',text:purchaseFixtures[0].text,idempotency_key:'http-fixture-create'};let r=await req('/imports',input);assert.equal(r.status,202);const id=r.data.id;
 for(let i=0;i<40;i++){r=await req('/imports/'+id);if(r.data.status==='review_required')break;await delay(20);}assert.equal(r.data.status,'review_required');let d=r.data;
 assert.equal((await req('/imports/'+id+'/items',{expected_revision:0,items:[]},'PATCH')).status,409);
 r=await req('/imports/'+id+'/items',{expected_revision:d.revision,items:d.items.map(({id,reviewed,selected})=>({id,reviewed,selected}))},'PATCH');assert.equal(r.status,200);d=r.data;
 const body={expected_revision:d.revision,selected_item_ids:d.items.map(i=>i.id),confirm_owned:true,idempotency_key:'http-fixture-commit'};const [one,two]=await Promise.all([req('/imports/'+id+'/commit',body),req('/imports/'+id+'/commit',body)]);assert.equal(one.status,200);assert.deepEqual(one.data,two.data);assert.equal(one.data.garments.length,1);
 const later=await req('/imports',{...input,idempotency_key:'http-cancel-create'});r=await req('/imports/'+later.data.id+'/cancel',{expected_revision:later.data.revision});assert.equal(r.status,200);await delay(50);assert.equal((await req('/imports/'+later.data.id)).data.status,'cancelled');
});
test('disabled purchase API hides entry and rejects import creation',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cq-import-off-')),api=createApi({storageDir:dir,cloud:null,access:createAccess({origin:undefined}),purchaseOptions:{enabled:false}});const server=http.createServer(api.middleware);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{api.close();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;assert.deepEqual(await fetch(base+'/imports/config').then(r=>r.json()),{enabled:false});assert.equal((await fetch(base+'/imports',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
});
