import { createHash } from 'node:crypto';
import { chat } from './agents.js';
import { normalizedCrop, normalizedRecognitionOptions } from './job-store.js';
import { modelFor } from './model-config.js';
import { createOpenAIChat, openAIModelFor } from './openai.js';
import { PIPELINE_VERSION, PROMPT_HASH, runRecognition } from './recognition.js';

export const RECOGNITION_CACHE_VERSION = 'recognition-provider-v1';

// Only validated observations are cached, never photos. No wardrobe scope means no
// cache. Serial photo jobs naturally reuse a completed observation without sharing
// an abort signal between users or caching a cancelled/failed call.
export function createRecognitionProvider({ localGenerate=chat, openaiFactory=createOpenAIChat, cache=new Map(), ttlMs=10*60*1000, maxEntries=128, now=Date.now }={}) {
  if (!Number.isFinite(ttlMs) || ttlMs < 0 || !Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError('Invalid recognition cache limits.');
  return async function recognizeWithProvider(image, options={}) {
    const {provider,modelProfile,wardrobeId}=normalizedRecognitionOptions(options);
    const crop=normalizedCrop(options.crop), {signal,onStage=()=>{}}=options;
    signal?.throwIfAborted();
    const started=performance.now();
    const model=provider==='openai'?openAIModelFor('recognition',modelProfile):modelFor('recognition');
    const key=wardrobeId && typeof image==='string' ? createHash('sha256').update(JSON.stringify([wardrobeId,provider,model,modelProfile,PIPELINE_VERSION,PROMPT_HASH,RECOGNITION_CACHE_VERSION,crop||null,image])).digest('hex') : null;
    for (const [id,entry] of cache) if (now()-entry.createdAt>=ttlMs) cache.delete(id);
    const hit=key && cache.get(key);
    if (hit) {
      // Refresh insertion order for bounded LRU eviction, without extending TTL.
      cache.delete(key); cache.set(key,hit);
      signal?.throwIfAborted(); onStage('validating'); signal?.throwIfAborted();
      const result=structuredClone(hit.result), originalLatencyMs=result.latencyMs;
      return {...result,latencyMs:Math.round(performance.now()-started),tokens:0,usage:undefined,pipeline:{...result.pipeline,stages:[],cache:{hit:true,scope:'wardrobe',ageMs:now()-hit.createdAt,originalLatencyMs,version:RECOGNITION_CACHE_VERSION}}};
    }
    const generate=provider==='openai' ? openaiFactory({task:'recognition',modelProfile,model,timeoutMs:30000,maxOutputTokens:1200,imageDetail:modelProfile==='fast'?'low':'auto'}) : localGenerate;
    const result=await runRecognition(image,generate,{signal,onStage,crop,model,timeoutMs:60000});
    signal?.throwIfAborted();
    result.pipeline={...result.pipeline,provider,modelProfile,cache:{hit:false,scope:wardrobeId?'wardrobe':'disabled',version:RECOGNITION_CACHE_VERSION}};
    if (key && ttlMs>0) {
      cache.set(key,{createdAt:now(),result:structuredClone(result)});
      while(cache.size>maxEntries) cache.delete(cache.keys().next().value);
    }
    return result;
  };
}

export const recognizeWithProvider=createRecognitionProvider();
