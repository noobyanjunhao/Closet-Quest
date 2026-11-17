import test from 'node:test';
import assert from 'node:assert/strict';
import {createPurchaseStore} from '../server/purchase-store.js';
import {createPurchaseImports} from '../server/purchase-imports.js';

const user={namespace:'retry-owner'};
async function setup(t,text='Cotton tee, color: blue, quantity: 1'){
 const store=createPurchaseStore(':memory:');let healthy=true;
 store.health=async()=>({ready:healthy});
 const service=createPurchaseImports({store,mode:'worker'});t.after(()=>service.close());
 const draft=await service.create(user,{source_type:'text',text,idempotency_key:'retry-source'});
 const failed=store.get(user.namespace,draft.id);failed.status='failed';failed.error={code:'WORKER_TIMEOUT'};failed.revision++;failed.audit.push({revision:failed.revision,event:'failed'});store.save(failed,draft.revision);
 return {store,service,failed,offline(){healthy=false;}};
}
test('retrying an unavailable worker returns an unapproved rules draft rather than stranding it in the queue',async t=>{
 const {store,service,failed,offline}=await setup(t);offline();
 const result=await service.retry(user,failed.id,{expected_revision:failed.revision});
 assert.equal(result.status,'review_required');assert.equal(result.model.provider,'rules');assert.equal(result.generation,2);assert.equal(result.revision,failed.revision+2);assert.equal(result.error,null);assert.equal(result.items.length,1);assert.equal(result.items[0].reviewedAt,null);assert.equal(store.counts().units,0);
 assert.deepEqual(result.audit.slice(-2).map(e=>e.event),['retry','offline-parser']);
 await assert.rejects(service.retry(user,failed.id,{expected_revision:failed.revision}),{code:'IMPORT_REVISION_CONFLICT'});
});
test('retry uses the worker when its heartbeat is available',async t=>{
 const {service,failed}=await setup(t);
 const result=await service.retry(user,failed.id,{expected_revision:failed.revision});assert.equal(result.status,'queued');assert.equal(result.model,undefined);assert.equal(result.generation,2);
});
test('offline retry parser errors leave a visible retryable failure without adding garments',async t=>{
 const {service,store,failed,offline}=await setup(t,'Cotton tee, quantity: 999');offline();
 const result=await service.retry(user,failed.id,{expected_revision:failed.revision});assert.equal(result.status,'failed');assert.equal(result.error.code,'IMPORT_PARSER_REVIEW');assert.equal(store.counts().units,0);
});
test('worker claim racing the offline fallback keeps the worker revision',async t=>{
 const {service,store,failed}=await setup(t);
 store.health=async()=>{const latest=store.get(user.namespace,failed.id);const expected=latest.revision;latest.status='extracting';latest.revision++;latest.audit.push({revision:latest.revision,event:'worker-claimed'});store.save(latest,expected);return{ready:false};};
 const result=await service.retry(user,failed.id,{expected_revision:failed.revision});assert.equal(result.status,'extracting');assert.equal(result.audit.at(-1).event,'worker-claimed');assert.equal(result.model,undefined);assert.equal(store.counts().units,0);
});
