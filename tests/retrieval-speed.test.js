import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {retrieveWardrobeHybrid} from '../server/hybrid-retrieval.js';
import {interactiveRetrievalOptions,createScopedDocumentEmbeddings,createRetrievalProvider} from '../server/retrieval-provider.js';
import {createKnowledgeStore} from '../server/knowledge.js';
import {createCloudKnowledgeHydrator} from '../server/cloud-knowledge.js';

const id='11111111-1111-4111-a111-111111111111',other='22222222-2222-4222-a222-222222222222';
const items=Array.from({length:18},(_,i)=>({id:`g${i}`,category:['Top','Bottom','Shoes','Dress','Outerwear','Accessory'][i%6],name:`Piece ${i}`,wears:i%4}));

test('Fast small closets retain every reviewed candidate and anchor with zero embedding calls',async()=>{
  let calls=0;
  const preferences={modelProfile:'fast'};
  const strategy=interactiveRetrievalOptions({items,preferences,provider:'openai'});
  const result=await retrieveWardrobeHybrid([...items,{...items[0],id:'pending',needsReview:true}],{request:'Wedding',anchorId:'g17'},{
    ...strategy,embeddingClient:{embed(){calls++;throw Error('should not embed');}},
  });
  assert.equal(calls,0);
  assert.deepEqual(result.items.map(item=>item.id),items.map(item=>item.id));
  assert.equal(result.retrieval.anchorId,'g17');
  assert.equal(result.retrieval.fallback.active,false);
  assert.equal(result.retrieval.acceleration.remoteEmbeddingCalls,0);
});
test('large closets, Balanced, Deep, and named study conditions retain hybrid retrieval',()=>{
  const base={items,preferences:{modelProfile:'fast'},provider:'openai'};
  for(const extra of [
    {items:[...items,{...items[0],id:'19'}]},
    {preferences:{modelProfile:'balanced'}},{preferences:{modelProfile:'deep'}},
    {studyCondition:'full'},{studyCondition:'no-memory'},{provider:'quick'},
  ])assert.deepEqual(interactiveRetrievalOptions({...base,...extra}),{});
});
test('document query vectors are cached per account while document edits and deletions remain fresh',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'closet-speed-'));
  let calls=0;
  const identity={provider:'openai',model:'test-model',digest:'test-model',schemaVersion:'openai-document-embedding-v1',dimensions:2};
  const provider=createRetrievalProvider({getModelIdentity:()=>identity,openaiFactory:()=>({async embed(records){
    calls++;return {vectors:records.map(()=>[1,1]),metadata:identity};
  }})});
  const store=createKnowledgeStore({storageDir:dir,seedDocuments:[],embeddingClients:{openai:createScopedDocumentEmbeddings(provider)}});
  t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
  const doc={title:'Wedding notes',content:'A navy jacket for the ceremony.'};
  const saved=await store.upsert(id,doc,{embeddingProvider:'openai'});
  assert.equal(calls,1);
  await store.search(id,'wedding',{embeddingProvider:'openai'});
  assert.equal(calls,2);
  const warm=await store.search(id,'wedding',{embeddingProvider:'openai'});
  assert.equal(calls,2);
  assert.equal(warm.metadata.queryEmbeddingCache.hits,1);
  await store.upsert(other,doc,{embeddingProvider:'openai'});
  await store.search(other,'wedding',{embeddingProvider:'openai'});
  assert.equal(calls,4,'Another account must compute its own vectors');
  await store.upsert(id,{...doc,id:saved.document.id,content:'Prefer a charcoal suit.'},{embeddingProvider:'openai'});
  const changed=await store.search(id,'wedding',{embeddingProvider:'openai'});
  assert.match(changed.sources[0].excerpt,/charcoal/);
  await store.remove(id,saved.document.id);
  assert.deepEqual((await store.search(id,'wedding',{embeddingProvider:'openai'})).sources,[]);
});
test('Fast cloud hydration searches new notes without indexing, refreshes deletions, and allows later semantic indexing',async()=>{
  let docs=[{id:'doc1',title:'Dress code',content:'Formal wedding.'}],reads=0;
  const saved=new Map(),upserts=[];
  const store={
    list:async()=>[...saved.values()],
    remove:async(_id,docId)=>saved.delete(docId),
    upsert:async(_id,doc,options)=>{upserts.push(options);saved.set(doc.id,{...doc,origin:'user'});return {indexing:{mode:options.lexicalOnly?'lexical':'semantic'}};},
  };
  const hydrate=createCloudKnowledgeHydrator({cloud:{documents:async()=>{reads++;return docs;}},getStore:()=>store});
  const user={id,namespace:id,cloud:true};
  await hydrate(user,{indexOnRead:false});
  assert.equal(upserts[0].lexicalOnly,true);
  await hydrate(user,{indexOnRead:false});
  assert.equal(upserts.length,1);
  await hydrate(user,{indexOnRead:true});
  assert.equal(upserts[1].lexicalOnly,false);
  docs=[];await hydrate(user,{indexOnRead:false});
  assert.equal(saved.size,0);assert.equal(reads,4);
});
test('cancelled cloud hydration does not write late note results',async()=>{
  const controller=new AbortController();let release,writes=0;
  const hydrate=createCloudKnowledgeHydrator({cloud:{documents:()=>new Promise(resolve=>{release=resolve;})},getStore:()=>({list:async()=>[],upsert:async()=>{writes++;}})});
  const pending=hydrate({id,namespace:id,cloud:true},{signal:controller.signal,indexOnRead:false});
  await new Promise(resolve=>setImmediate(resolve));
  controller.abort(new Error('stopped'));
  release([{id:'doc',title:'Private',content:'content'}]);
  await assert.rejects(pending,/stopped/);
  assert.equal(writes,0);
});
