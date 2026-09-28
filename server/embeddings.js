import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const EMBEDDING_MODEL='qwen3-embedding:0.6b';
export const EMBEDDING_SCHEMA_VERSION='wardrobe-text-v1';
const defaultCacheDirectory=fileURLToPath(new URL('../.local-data/embeddings/',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');

export class EmbeddingError extends Error {
  constructor(message,code='EMBEDDING_UNAVAILABLE') { super(message);this.name='EmbeddingError';this.code=code; }
}

export function normalizeVector(vector,dimensions) {
  if(!Array.isArray(vector)||vector.length!==dimensions||vector.some(value=>!Number.isFinite(value)))throw new EmbeddingError('The embedding model returned an invalid vector.','INVALID_EMBEDDING');
  const norm=Math.sqrt(vector.reduce((sum,value)=>sum+value*value,0));
  if(!Number.isFinite(norm)||norm<=0)throw new EmbeddingError('The embedding model returned an empty vector.','INVALID_EMBEDDING');
  return vector.map(value=>value/norm);
}

export function cosineSimilarity(left,right) {
  if(left.length!==right.length||!left.length)throw new EmbeddingError('Embedding dimensions do not match.','INVALID_EMBEDDING');
  let dot=0,leftNorm=0,rightNorm=0;
  for(let index=0;index<left.length;index++) {
    if(!Number.isFinite(left[index])||!Number.isFinite(right[index]))throw new EmbeddingError('Embedding values are invalid.','INVALID_EMBEDDING');
    dot+=left[index]*right[index];leftNorm+=left[index]*left[index];rightNorm+=right[index]*right[index];
  }
  if(!leftNorm||!rightNorm)throw new EmbeddingError('Embedding vector is empty.','INVALID_EMBEDDING');
  return Math.max(-1,Math.min(1,dot/Math.sqrt(leftNorm*rightNorm)));
}

// Include only garment descriptions, never photos, job state, labels inferred from an image, or wear history.
export function garmentEmbeddingText(item) {
  const fields={name:120,category:30,itemType:80,colorName:80,pattern:100,fit:80,materialAppearance:180,tags:240,styleTags:200,occasions:160};
  return Object.entries(fields).flatMap(([field,limit])=>{
    const value=Array.isArray(item[field])?item[field].join(', '):item[field];
    return typeof value==='string'&&value.trim()?[`${field}: ${Array.from(value.trim()).slice(0,limit).join('')}`]:[];
  }).join('\n');
}

export function queryEmbeddingText(request,context='') {
  return `Instruct: Retrieve owned wardrobe items relevant to this styling brief and occasion.\nQuery: ${context ? context+'. ' : ''}${request||'A complete everyday outfit.'}`;
}

export function createEmbeddingClient({fetchImpl=globalThis.fetch,model=process.env.CLOSET_EMBED_MODEL||EMBEDDING_MODEL,dimensions=512,cacheDir=defaultCacheDirectory,schemaVersion=EMBEDDING_SCHEMA_VERSION,numGpu=0,keepAlive='5m',timeoutMs=45000,batchSize=16,getModelIdentity,embedTexts,memoryCache}={}) {
  if(!Number.isInteger(dimensions)||dimensions<1||dimensions>4096||!Number.isInteger(batchSize)||batchSize<1||batchSize>32)throw new Error('Invalid embedding client configuration.');
  async function identity(signal) {
    if(getModelIdentity)return getModelIdentity({model,signal});
    const response=await fetchImpl('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.any([signal,AbortSignal.timeout(3000)])});
    if(!response.ok)throw new EmbeddingError('Cannot check installed local embedding models.');
    const data=await response.json();
    const installed=data.models?.find(entry=>(entry.name||entry.model)===model);
    if(!installed?.digest)throw new EmbeddingError(`The local embedding model ${model} is not installed.`,'EMBEDDING_MODEL_MISSING');
    return {model,digest:installed.digest};
  }
  async function generate(texts,signal) {
    if(embedTexts)return embedTexts(texts,{model,dimensions,signal,numGpu,keepAlive});
    const response=await fetchImpl('http://127.0.0.1:11434/api/embed',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({model,input:texts,dimensions,truncate:false,keep_alive:keepAlive,options:{num_gpu:numGpu,num_ctx:8192}})});
    if(!response.ok)throw new EmbeddingError(response.status===404?`The local embedding model ${model} is not installed.`:'Local text embedding inference failed.',response.status===404?'EMBEDDING_MODEL_MISSING':'EMBEDDING_UNAVAILABLE');
    return (await response.json()).embeddings;
  }
  async function embed(records,{signal:parentSignal}={}) {
    if(!Array.isArray(records)||!records.length||records.length>201||records.some(record=>!record||!['query','garment'].includes(record.kind)||typeof record.text!=='string'||!record.text.length||record.text.length>4000))throw new EmbeddingError('Invalid text embedding input.','INVALID_EMBEDDING_INPUT');
    parentSignal?.throwIfAborted();
    const started=performance.now();
    const timeout=AbortSignal.timeout(timeoutMs);
    const signal=parentSignal?AbortSignal.any([parentSignal,timeout]):timeout;
    const stats={requested:records.length,unique:0,hits:0,memoryHits:0,misses:0,generated:0,readErrors:0,writeErrors:0};
    try {
      const installed=await identity(signal);
      if(typeof installed?.digest!=='string'||!installed.digest||installed.digest.length>256)throw new EmbeddingError('The local embedding model has no valid digest.','EMBEDDING_IDENTITY_INVALID');
      const unique=new Map();
      const entries=records.map(record=>{
        const textHash=hash(record.text);
        const key=hash(JSON.stringify({model,digest:installed.digest,schemaVersion,dimensions,kind:record.kind,textHash}));
        if(!unique.has(key))unique.set(key,{key,textHash,record,vector:null});
        return unique.get(key);
      });
      stats.unique=unique.size;
      const missing=[];
      for(const entry of unique.values()) {
        signal.throwIfAborted();
        if(memoryCache?.has(entry.key)) {entry.vector=[...memoryCache.get(entry.key)];stats.memoryHits++;}
        if(!entry.vector&&cacheDir)try {
          const saved=JSON.parse(await readFile(join(cacheDir,entry.key+'.json'),'utf8'));
          if(saved.model===model&&saved.modelDigest===installed.digest&&saved.schemaVersion===schemaVersion&&saved.textHash===entry.textHash&&saved.kind===entry.record.kind&&saved.dimensions===dimensions)entry.vector=normalizeVector(saved.vector,dimensions);
        }catch(error){if(error.code!=='ENOENT')stats.readErrors++;}
        if(entry.vector)stats.hits++;
        else { stats.misses++;missing.push(entry); }
      }
      for(let offset=0;offset<missing.length;offset+=batchSize) {
        signal.throwIfAborted();
        const batch=missing.slice(offset,offset+batchSize);
        const generated=await generate(batch.map(entry=>entry.record.text),signal);
        signal.throwIfAborted();
        if(!Array.isArray(generated)||generated.length!==batch.length)throw new EmbeddingError('The embedding model returned the wrong number of vectors.','INVALID_EMBEDDING');
        for(let index=0;index<batch.length;index++)batch[index].vector=normalizeVector(generated[index],dimensions);
        stats.generated+=batch.length;
        if(cacheDir) {
          try { await mkdir(cacheDir,{recursive:true}); }catch{stats.writeErrors+=batch.length;continue;}
          for(const entry of batch) {
            const temporary=join(cacheDir,entry.key+'.'+randomUUID()+'.tmp');
            try {
              await writeFile(temporary,JSON.stringify({model,modelDigest:installed.digest,schemaVersion,kind:entry.record.kind,textHash:entry.textHash,dimensions,normalization:'l2',createdAt:new Date().toISOString(),vector:entry.vector}),{flag:'wx'});
              await rename(temporary,join(cacheDir,entry.key+'.json'));
            }catch{stats.writeErrors++;await unlink(temporary).catch(()=>{});}
          }
        }
      }
      signal.throwIfAborted();
      if(memoryCache)for(const entry of unique.values()) {
        memoryCache.delete(entry.key);memoryCache.set(entry.key,[...entry.vector]);
        while(memoryCache.size>512)memoryCache.delete(memoryCache.keys().next().value);
      }
      return {vectors:entries.map(entry=>entry.vector),metadata:{available:true,model,digest:installed.digest,schemaVersion,dimensions,placement:numGpu===0?'cpu':'runtime-configured',cache:stats,timingMs:Number((performance.now()-started).toFixed(2))}};
    }catch(error) {
      if(parentSignal?.aborted)throw parentSignal.reason;
      const failure=error instanceof EmbeddingError?error:new EmbeddingError(timeout.aborted?'Local text embeddings timed out.':'Cannot reach the local text embedding service.',timeout.aborted?'EMBEDDING_TIMEOUT':'EMBEDDING_UNAVAILABLE');
      failure.metadata={available:false,model,schemaVersion,dimensions,placement:numGpu===0?'cpu':'runtime-configured',cache:stats,timingMs:Number((performance.now()-started).toFixed(2))};
      throw failure;
    }
  }
  return {embed};
}
