import { randomUUID } from 'node:crypto';
import { style } from './agents.js';
import { retrieveWardrobeHybrid } from './hybrid-retrieval.js';
import { createOpenAIChat, openAIStatus, resolveOpenAIModel } from './openai.js';
import { PipelineError } from './recognition.js';
import { personalizeRequest, applyPreferenceScores } from './personalization.js';
import { retrievalDependenciesFor } from './retrieval-provider.js';

export const RECOMMENDATION_VERSION = 'recommendation-v3-personal-rag';
export function resolveProvider(requested = 'auto') {
  if (!['auto', 'openai', 'local', 'quick'].includes(requested)) throw new PipelineError('Choose a supported styling method.', { code: 'INVALID_PROVIDER', status: 400 });
  return requested === 'auto' ? (openAIStatus().configured ? 'openai' : 'quick') : requested;
}

// The same server-prepared plan IDs and final validator are used by every provider.
export async function quickChat(_schema, _system, content) {
  const context = JSON.parse(content);
  return { model: 'deterministic-planner-v1', latencyMs: 0, data: {
    outfits: context.plans.slice(0, 3).map((plan, index) => ({ planId: plan.id,
      title: `${context.context || 'Your closet'} · Look ${index + 1}`.slice(0, 80),
      explanation: 'A complete combination of reviewed pieces, ranked against your brief and balanced with other options for variety.',
      stylingTip: 'Try these pieces together and adjust the tuck or layering to your preference.',
    })), reason: 'Quick matches use your saved details and outfit rules. Try OpenAI or the local stylist for more personal styling advice.',
  } };
}

export async function recommend(body, { signal, retrieve = retrieveWardrobeHybrid, retrievalDependencies = {}, openaiChat, localChat, provider: providerOverride, knowledgeSearch } = {}) {
  const started = performance.now();
  const provider = providerOverride || resolveProvider(body?.provider);
  signal?.throwIfAborted();
  // Interactive semantic retrieval has a bounded budget; quick mode uses lexical RAG.
  const personal=personalizeRequest(body);
  const retrievalRequest=[personal.request,personal.preferenceSummary].filter(Boolean).join(' ').slice(0,2000);
  let prepared = await retrieve(personal.items, { ...personal,request:retrievalRequest, signal }, { timeoutMs: 6000, ...retrievalDependenciesFor({provider,embeddingProvider:personal.preferences.embeddingProvider,wardrobeId:body.wardrobeId}), ...retrievalDependencies, ...(provider === 'quick' ? { enabled: false } : {}) });
  prepared=applyPreferenceScores(prepared,personal);
  let knowledge={sources:[],metadata:{mode:'not-requested'}};
  if(knowledgeSearch&&typeof body.wardrobeId==='string') {
    try {knowledge=await knowledgeSearch(body.wardrobeId,[personal.context,retrievalRequest].join(' ').slice(0,1000),{signal,limit:4,lexicalOnly:provider==='quick',embeddingProvider:personal.preferences.embeddingProvider});}
    catch(error){if(signal?.aborted)throw signal.reason;knowledge={sources:[],metadata:{mode:'unavailable',reason:'Your knowledge library could not be searched. Styling uses wardrobe facts and saved preferences.'}};}
  }
  prepared.retrieval.knowledge=knowledge;
  body={...body,...personal,request:personal.request};
  const retrievalMs = performance.now() - started;
  let result, fallback = null, actualProvider = provider;
  const generationStart = performance.now();
  try {
    result = await style(body, { signal, prepared, timeoutMs: 45000,
      generate: provider === 'quick' ? quickChat : provider === 'openai' ? (openaiChat || createOpenAIChat({model:resolveOpenAIModel('recommendation',personal.preferences.modelProfile),modelProfile:personal.preferences.modelProfile})) : localChat });
    if (result.planning.rejectedSelectionCount > 0 && !result.data.outfits.length) throw new PipelineError('The model selected invalid outfit plans.', { code: 'INVALID_PLAN_SELECTION' });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (provider === 'quick' || error.status === 400) throw error;
    fallback = { code: error.code || 'INVALID_MODEL_RESPONSE', message: 'The AI stylist could not finish. Showing quick wardrobe matches instead.' };
    actualProvider = 'quick';
    result = await style(body, { signal, prepared, generate: quickChat });
  }
  signal?.throwIfAborted();
  // A live local run invented a tee in a title for a sweater plan. Derive the
  // displayed title from actual records; keep generative prose as styling advice.
  if(actualProvider!=='quick')result.data.outfits=result.data.outfits.map(outfit=>{
    const core=outfit.itemIds.map(id=>prepared.items.find(item=>item.id===id)).filter(item=>['Top','Bottom','Dress'].includes(item.category));
    return {...outfit,title:core.map(item=>item.name||item.category).join(' + ').slice(0,80)};
  });
  return { ...result, pipeline: { version: RECOMMENDATION_VERSION, runId: randomUUID(), requestedProvider: body.provider || 'auto', provider: actualProvider,
    fallback, retrievalPasses: 1, stages: ['preferences', 'wardrobe-retrieval', 'document-retrieval', 'plan', 'select', 'validate'], modelProfile:personal.preferences.modelProfile, promptVersion:'stylist-rag-v3', knowledgeMode:knowledge.metadata?.mode,
    timingMs: { retrieval: Math.round(retrievalMs), selectionAndValidation: Math.round(performance.now() - generationStart), total: Math.round(performance.now() - started) } } };
}
