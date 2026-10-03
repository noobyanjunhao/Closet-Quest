import { PipelineError } from './recognition.js';

// Model names are selected on the server; clients can choose only a bounded profile.
export const OPENAI_MODEL_PROFILES = Object.freeze({
  fast: Object.freeze({ model:'gpt-6-luna', label:'Fast', reasoningEffort:'low' }),
  balanced: Object.freeze({ model:'gpt-6.1-sol', label:'Balanced', reasoningEffort:'low' }),
  deep: Object.freeze({ model:'gpt-6-astra', label:'Deep', reasoningEffort:'medium' }),
});
export const OPENAI_MODEL = OPENAI_MODEL_PROFILES.fast.model;
export function openAIModelFor(task='recommendation', modelProfile='fast') {
  if (!Object.hasOwn(OPENAI_MODEL_PROFILES, modelProfile)) throw new PipelineError('Choose Fast, Balanced or Deep for the model profile.', { code:'INVALID_MODEL_PROFILE', status:400 });
  if (!['recognition','recommendation'].includes(task)) throw new TypeError('Unknown OpenAI task.');
  return process.env[task === 'recognition' ? 'CLOSET_OPENAI_RECOGNITION_MODEL' : 'CLOSET_OPENAI_RECOMMENDATION_MODEL']?.trim()
    || process.env.CLOSET_OPENAI_MODEL?.trim() || OPENAI_MODEL_PROFILES[modelProfile].model;
}
export const resolveOpenAIModel = openAIModelFor;
export function openAIStatus() {
  return { configured:Boolean(process.env.OPENAI_API_KEY?.trim()), model:openAIModelFor(), recognitionModel:openAIModelFor('recognition'), profiles:Object.entries(OPENAI_MODEL_PROFILES).map(([id,value])=>({id,label:value.label,recognitionModel:openAIModelFor('recognition',id),recommendationModel:openAIModelFor('recommendation',id)})) };
}

export function createOpenAIChat({ apiKey = process.env.OPENAI_API_KEY, task='recommendation', modelProfile='fast', model = openAIModelFor(task,modelProfile), fetchImpl = globalThis.fetch, timeoutMs = 20000, maxOutputTokens = 1200, imageDetail='auto' } = {}) {
  if (!Object.hasOwn(OPENAI_MODEL_PROFILES,modelProfile)) throw new PipelineError('Choose Fast, Balanced or Deep for the model profile.', { code:'INVALID_MODEL_PROFILE', status:400 });
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 4096 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new RangeError('Invalid OpenAI request limits.');
  if (!['auto','low','high'].includes(imageDetail)) throw new RangeError('Invalid image detail.');
  return async (schema, system, content, image, { signal } = {}) => {
    if (!apiKey?.trim()) throw new PipelineError('OpenAI is not configured. Add OPENAI_API_KEY to .env.local and restart the server.', { code: 'OPENAI_NOT_CONFIGURED', status: 503 });
    signal?.throwIfAborted();
    // Recognition supplies a normalized JPEG, with EXIF removed by normalizePhoto.
    if (image && (typeof image !== 'string' || image.length > 8000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image))) throw new PipelineError('The normalized photo is invalid.', { code:'INVALID_IMAGE', status:400 });
    const input=image ? [{role:'user',content:[{type:'input_text',text:content},{type:'input_image',image_url:`data:image/jpeg;base64,${image}`,detail:imageDetail}]}] : content;
    const started = performance.now();
    const deadline = AbortSignal.timeout(timeoutMs);
    let response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        body: JSON.stringify({ model, store: false, instructions: system, input, max_output_tokens:maxOutputTokens,
          ...(/^gpt-[56](?:[.-]|$)/.test(model)?{reasoning:{effort:OPENAI_MODEL_PROFILES[modelProfile].reasoningEffort}}:{}),
          text: { format: { type: 'json_schema', name: image?'garment_observation':'wardrobe_plans', strict: true, schema } } }),
      });
      if (!response.ok) throw new PipelineError(response.status === 401 ? 'OpenAI rejected the API key.' : response.status === 429 ? 'OpenAI is at its request or billing limit.' : 'OpenAI could not complete this request.', { code: `OPENAI_HTTP_${response.status}`, status: 503 });
      const result = await response.json();
      const parts = (result.output || []).flatMap(item => item.content || []);
      if (result.status !== 'completed' || parts.some(part => part.type === 'refusal')) throw new PipelineError('OpenAI did not complete a usable response. Retry or switch models.', { code: 'OPENAI_INCOMPLETE', status: 503 });
      const data = JSON.parse(parts.filter(part => part.type === 'output_text').map(part => part.text).join(''));
      return { data, model, latencyMs: Math.round(performance.now() - started), tokens: result.usage?.output_tokens, usage: result.usage };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof PipelineError) throw error;
      throw new PipelineError(deadline.aborted ? 'OpenAI took too long to respond.' : 'OpenAI returned an unavailable or unreadable response.', { code: deadline.aborted ? 'OPENAI_TIMEOUT' : 'OPENAI_UNAVAILABLE', status: 503 });
    }
  };
}

// Explicit opt-in adapter for the local document vector database. The caller
// chooses this provider; it never silently uploads documents during local search.
export function createOpenAIEmbeddingClient({apiKey=process.env.OPENAI_API_KEY,model=process.env.CLOSET_OPENAI_EMBED_MODEL?.trim()||'text-embedding-3-small',dimensions=512,fetchImpl=globalThis.fetch,timeoutMs=15000}={}) {
  if (!Number.isInteger(dimensions) || dimensions<2 || dimensions>3072 || !Number.isFinite(timeoutMs) || timeoutMs<1 || timeoutMs>120000) throw new RangeError('Invalid embedding request limits.');
  const metadata={provider:'openai',model,digest:model,schemaVersion:'openai-document-embedding-v1',dimensions};
  return {async embed(records,{signal}={}) {
    signal?.throwIfAborted();
    if (!apiKey?.trim()) throw new PipelineError('OpenAI is not configured. Add OPENAI_API_KEY to .env.local and restart the server.', {code:'OPENAI_NOT_CONFIGURED',status:503});
    if (!Array.isArray(records) || records.length>512 || records.some(record=>typeof record?.text!=='string'||!record.text.trim()||Buffer.byteLength(record.text,'utf8')>12000)) throw new PipelineError('Provide bounded, nonempty document chunks for embedding.', {code:'INVALID_EMBEDDING_INPUT',status:400});
    const started=performance.now(),vectors=[];
    const deadline=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,deadline]):deadline;
    try {
      for(let offset=0;offset<records.length;offset+=32) {
        combined.throwIfAborted();
        const batch=records.slice(offset,offset+32);
        const response=await fetchImpl('https://api.openai.com/v1/embeddings',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},signal:combined,body:JSON.stringify({model,dimensions,encoding_format:'float',input:batch.map(record=>record.text)})});
        if(!response.ok)throw new PipelineError('OpenAI could not embed these documents. Check API access and try again.',{code:`OPENAI_HTTP_${response.status}`,status:503});
        const result=await response.json();
        if(!Array.isArray(result.data)||result.data.length!==batch.length)throw new PipelineError('OpenAI returned incomplete document vectors.',{code:'OPENAI_INVALID_EMBEDDINGS',status:503});
        const ordered=new Array(batch.length);
        for(const entry of result.data) {
          const vector=entry?.embedding,index=entry?.index;
          if(!Number.isInteger(index)||index<0||index>=batch.length||ordered[index]||!Array.isArray(vector)||vector.length!==dimensions||vector.some(value=>!Number.isFinite(value)))throw new PipelineError('OpenAI returned invalid document vectors.',{code:'OPENAI_INVALID_EMBEDDINGS',status:503});
          const magnitude=Math.hypot(...vector);
          if(!Number.isFinite(magnitude)||magnitude<=0)throw new PipelineError('OpenAI returned an empty document vector.',{code:'OPENAI_INVALID_EMBEDDINGS',status:503});
          ordered[index]=vector.map(value=>value/magnitude);
        }
        vectors.push(...ordered);
      }
      combined.throwIfAborted();
      return {vectors,metadata:{...metadata,latencyMs:Math.round(performance.now()-started)}};
    } catch(error) {
      if(signal?.aborted)throw signal.reason;
      if(error instanceof PipelineError)throw error;
      throw new PipelineError(deadline.aborted?'OpenAI embedding took too long. Retry or use local search.':'OpenAI document embedding is unavailable.',{code:deadline.aborted?'OPENAI_TIMEOUT':'OPENAI_UNAVAILABLE',status:503});
    }
  }};
}
