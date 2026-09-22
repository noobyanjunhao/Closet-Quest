import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {createEmbeddingClient,cosineSimilarity,normalizeVector,garmentEmbeddingText} from '../server/embeddings.js';

async function temporaryCache(t) {
  const directory=await mkdtemp(join(tmpdir(),'closet-embedding-test-'));
  const relativePath=relative(resolve(tmpdir()),resolve(directory));
  assert.ok(relativePath.startsWith('closet-embedding-test-')&&!relativePath.includes('..'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return directory;
}
const records=()=>[{kind:'query',text:'An outfit for work'},{kind:'garment',text:'PRIVATE GARMENT blue shirt'},{kind:'garment',text:'Gray trousers'}];

test('disk embeddings are reused and invalidate for text, model digest, schema and dimensions',async(t)=>{
  const cacheDir=await temporaryCache(t);
  let digest='digest-one',generatedCount=0;
  const config={cacheDir,dimensions:3,getModelIdentity:async()=>({digest}),embedTexts:async(texts,{dimensions})=>{generatedCount+=texts.length;return texts.map((text,index)=>Array.from({length:dimensions},(_,axis)=>axis===index%dimensions?2:1));}};
  const first=await createEmbeddingClient(config).embed(records());
  assert.deepEqual([first.metadata.cache.hits,first.metadata.cache.generated],[0,3]);
  assert.equal(first.vectors[0].length,3);
  const cached=await createEmbeddingClient(config).embed(records());
  assert.deepEqual([cached.metadata.cache.hits,cached.metadata.cache.generated],[3,0]);
  assert.equal(generatedCount,3);
  const corrected=records();corrected[1].text='PRIVATE GARMENT red shirt';
  const correction=await createEmbeddingClient(config).embed(corrected);
  assert.deepEqual([correction.metadata.cache.hits,correction.metadata.cache.generated],[2,1]);
  digest='digest-two';
  assert.equal((await createEmbeddingClient(config).embed(corrected)).metadata.cache.generated,3);
  assert.equal((await createEmbeddingClient({...config,schemaVersion:'future-schema'}).embed(corrected)).metadata.cache.generated,3);
  assert.equal((await createEmbeddingClient({...config,dimensions:4}).embed(corrected)).metadata.cache.generated,3);
  const files=await readdir(cacheDir);
  const saved=await readFile(join(cacheDir,files[0]),'utf8');
  assert.ok(!saved.includes('PRIVATE GARMENT'));
  assert.ok(saved.includes('textHash')&&saved.includes('modelDigest'));
});

test('duplicate text is embedded once; corrupt cache is recomputed without using malformed vectors',async(t)=>{
  const cacheDir=await temporaryCache(t);
  const config={cacheDir,dimensions:2,getModelIdentity:async()=>({digest:'same'}),embedTexts:async texts=>texts.map(()=>[1,2])};
  const input=[records()[0],records()[0]];
  const first=await createEmbeddingClient(config).embed(input);
  assert.equal(first.metadata.cache.unique,1);
  assert.equal(first.metadata.cache.generated,1);
  assert.deepEqual(first.vectors[0],first.vectors[1]);
  const file=(await readdir(cacheDir))[0];await writeFile(join(cacheDir,file),'broken JSON');
  const repaired=await createEmbeddingClient(config).embed(input);
  assert.equal(repaired.metadata.cache.readErrors,1);
  assert.equal(repaired.metadata.cache.generated,1);
});

test('Ollama integration pins model identity, CPU placement, explicit dimensions and no silent truncation',async()=>{
  const calls=[];
  const client=createEmbeddingClient({cacheDir:null,dimensions:2,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/tags'))return {ok:true,json:async()=>({models:[{name:'qwen3-embedding:0.6b',digest:'model-digest'}]})};
    const body=JSON.parse(options.body);
    assert.equal(body.options.num_gpu,0);assert.equal(body.truncate,false);assert.equal(body.dimensions,2);
    return {ok:true,json:async()=>({embeddings:body.input.map(()=>[3,4])})};
  }});
  const result=await client.embed(records());
  assert.equal(result.metadata.digest,'model-digest');
  assert.equal(result.metadata.placement,'cpu');
  assert.deepEqual(result.vectors[0],[0.6,0.8]);
  assert.equal(calls.length,2);
});

test('missing model, mismatched dimensions and zero vectors fail explicitly',async()=>{
  await assert.rejects(createEmbeddingClient({cacheDir:null,fetchImpl:async()=>({ok:true,json:async()=>({models:[]})})}).embed(records()),{code:'EMBEDDING_MODEL_MISSING'});
  await assert.rejects(createEmbeddingClient({cacheDir:null,dimensions:2,getModelIdentity:async()=>({digest:'x'}),embedTexts:async texts=>texts.map(()=>[1])}).embed(records()),{code:'INVALID_EMBEDDING'});
  assert.throws(()=>normalizeVector([0,0],2),{code:'INVALID_EMBEDDING'});
  assert.throws(()=>cosineSimilarity([1],[1,2]),{code:'INVALID_EMBEDDING'});
  assert.equal(cosineSimilarity([1,0],[-1,0]),-1);
});

test('cancellation propagates instead of being converted to an embedding failure',async()=>{
  const controller=new AbortController();
  const client=createEmbeddingClient({cacheDir:null,dimensions:2,getModelIdentity:async()=>({digest:'x'}),embedTexts:async(texts,{signal})=>{controller.abort();signal.throwIfAborted();}});
  await assert.rejects(client.embed(records(),{signal:controller.signal}),{name:'AbortError'});
});

test('garment embedding text is bounded and excludes photos, job state and wear history',()=>{
  const text=garmentEmbeddingText({name:'Coat',category:'Outerwear',tags:Array.from({length:20},()=> 'x'.repeat(160)),materialAppearance:'y'.repeat(500),image:'SECRET_PHOTO',recognition:'SECRET_JOB',wears:12345});
  assert.ok(text.length<800);
  assert.ok(!text.includes('SECRET')&&!text.includes('12345'));
});
