import { randomUUID } from 'node:crypto';
import { style } from './agents.js';
import { retrieveWardrobeHybrid } from './hybrid-retrieval.js';
import { createOpenAIChat, openAIStatus, resolveOpenAIModel } from './openai.js';
import { PipelineError } from './recognition.js';
import { personalizeRequest, applyPreferenceScores } from './personalization.js';
import { retrievalDependenciesFor, interactiveRetrievalOptions } from './retrieval-provider.js';
import { retrieveWardrobe } from './retrieval.js';
import { stylingOccasion, shoppingSuggestions, quickStylingNote } from './styling-brief.js';

export const RECOMMENDATION_VERSION = 'recommendation-v4-useful-starting-points';
// Abort the underlying work and settle even if a provider ignores cancellation.
async function withinBudget(work, ms, parentSignal, code) {
  const controller = new AbortController();
  const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal;
  let timer, onAbort;
  try {
    signal.throwIfAborted();
    const stop = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, {once:true});
      timer = setTimeout(() => controller.abort(new PipelineError('The stylist reached its response time limit.', {code,status:503})), ms);
    });
    return await Promise.race([Promise.resolve().then(()=>work(signal)), stop]);
  } finally {clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
}
export function resolveProvider(requested = 'auto') {
  if (!['auto', 'openai', 'local', 'quick'].includes(requested)) throw new PipelineError('Choose a supported styling method.', { code: 'INVALID_PROVIDER', status: 400 });
  return requested === 'auto' ? (openAIStatus().configured ? 'openai' : 'quick') : requested;
}

// The same server-prepared plan IDs and final validator are used by every provider.
export async function quickChat(_schema, _system, content) {
  const context = JSON.parse(content);
  return { model: 'deterministic-planner-v1', latencyMs: 0, data: {
    outfits: context.plans.slice(0, 3).map((plan, index) => {
      const items=plan.itemIds.map(id=>context.items.find(item=>item.id===id));
      return { planId: plan.id,
      title: `${context.context || 'Your closet'} · ${plan.missingCategories?.length?'Starting point':'Look'} ${index + 1}`.slice(0, 80),
      explanation: quickStylingNote(items,context.context,shoppingSuggestions(items,context.context)),
      stylingTip: ['Wedding','Formal'].includes(context.context)?'Check the invitation before choosing your final look.':'Try the pieces together and adjust the tuck or layering until it feels like you.',
    };}), reason: 'Here’s what we can work with. Any extra pieces below are ideas to complete the look, not items in your closet.',
  } };
}

export async function recommend(body, { signal, retrieve = retrieveWardrobeHybrid, retrievalDependencies = {}, openaiChat, localChat, provider: providerOverride, knowledgeSearch, budgets={} } = {}) {
  const started = performance.now();
  body={...body,allowPartial:true,context:stylingOccasion(body?.request,body?.context)};
  if(body?.studyCondition!==undefined&&!['baseline','full','no-memory'].includes(body.studyCondition))throw new PipelineError('Unknown study condition.',{status:400,code:'INVALID_STUDY_CONDITION'});
  const studyCondition=body?.studyCondition;
  if(studyCondition==='baseline'||studyCondition==='no-memory') {
    body={...body,provider:studyCondition==='baseline'?'quick':body.provider,preferences:{modelProfile:body.preferences?.modelProfile,embeddingProvider:body.preferences?.embeddingProvider},recommendationHistory:[]};
    knowledgeSearch=undefined;
  }
  const provider = providerOverride || resolveProvider(body?.provider);
  signal?.throwIfAborted();
  // Interactive semantic retrieval has a bounded budget; quick mode uses lexical RAG.
  const personal=personalizeRequest(body);
  const retrievalRequest=[personal.request,personal.preferenceSummary].filter(Boolean).join(' ').slice(0,2000);
  const retrievalBudget=budgets.retrievalMs??4000;
  const fastOptions=interactiveRetrievalOptions({...personal,provider,studyCondition});
  const wardrobeWork=withinBudget(stageSignal=>retrieve(personal.items, { ...personal,request:retrievalRequest, signal:stageSignal }, { timeoutMs: retrievalBudget, ...retrievalDependenciesFor({provider,embeddingProvider:personal.preferences.embeddingProvider,wardrobeId:body.wardrobeId}), ...fastOptions, ...retrievalDependencies, ...(provider === 'quick' || !personal.items.some(i=>!i.needsReview) ? { enabled: false } : {}) }),retrievalBudget,signal,'RETRIEVAL_TIMEOUT').catch(error=>{
    if(signal?.aborted)throw signal.reason;
    if(error.status===400)throw error;
    const lexical=retrieveWardrobe(personal.items,{...personal,request:retrievalRequest});
    return {...lexical,retrieval:{...lexical.retrieval,fallback:{active:true,code:error.code||'RETRIEVAL_UNAVAILABLE',reason:'Using keyword matches to keep styling moving.'}}};
  });
  const knowledgeWork=(async()=>{
    if(!knowledgeSearch||typeof body.wardrobeId!=='string')return {sources:[],metadata:{mode:'not-requested'}};
    try {return await withinBudget(stageSignal=>knowledgeSearch(body.wardrobeId,[personal.context,retrievalRequest].join(' ').slice(0,1000),{signal:stageSignal,limit:4,lexicalOnly:provider==='quick',indexOnRead:provider!=='quick'&&(personal.preferences.modelProfile!=='fast'||Boolean(studyCondition)),embeddingProvider:personal.preferences.embeddingProvider}),budgets.knowledgeMs??4000,signal,'KNOWLEDGE_TIMEOUT');}
    catch(error){if(signal?.aborted)throw signal.reason;return {sources:[],metadata:{mode:'unavailable',reason:'Personal notes were unavailable in time. Using wardrobe facts and preferences.'}};}
  })();
  let [prepared,knowledge]=await Promise.all([wardrobeWork,knowledgeWork]);
  prepared=applyPreferenceScores(prepared,personal);
  prepared.retrieval.knowledge=knowledge;
  body={...body,...personal,request:personal.request};
  const retrievalMs = performance.now() - started;
  let result, fallback = null, actualProvider = provider;
  const generationStart = performance.now();
  try {
    const generationBudget=budgets.generationMs??({fast:12000,balanced:18000,deep:25000}[personal.preferences.modelProfile]||12000);
    result = await withinBudget(stageSignal=>style(body, { signal:stageSignal, prepared, timeoutMs:generationBudget,
      generate: provider === 'quick' ? quickChat : provider === 'openai' ? (openaiChat || createOpenAIChat({model:resolveOpenAIModel('recommendation',personal.preferences.modelProfile),modelProfile:personal.preferences.modelProfile,timeoutMs:generationBudget,maxOutputTokens:1600})) : localChat }),generationBudget,signal,'STYLING_TIMEOUT');
    if (!result.data.outfits.length) throw new PipelineError('The model did not select a useful starting point.', { code: 'EMPTY_PLAN_SELECTION' });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (provider === 'quick' || error.status === 400) throw error;
    fallback = { code: error.code || 'INVALID_MODEL_RESPONSE', message: 'I’ve put together a quick starting point so you don’t have to wait. You can try the AI again for a more personal take.' };
    actualProvider = 'quick';
    result = await style(body, { signal, prepared, generate: quickChat });
  }
  signal?.throwIfAborted();
  // A live local run invented a tee in a title for a sweater plan. Derive the
  // displayed title from actual records; keep generative prose as styling advice.
  if(actualProvider!=='quick')result.data.outfits=result.data.outfits.map(outfit=>{
    const core=outfit.itemIds.map(id=>prepared.items.find(item=>item.id===id)).filter(item=>['Top','Bottom','Dress'].includes(item.category));
    return {...outfit,title:core.map(item=>item.name||item.category).join(' + ').slice(0,80)||`${personal.context} · A starting point`};
  });
  return { ...result, pipeline: { version: RECOMMENDATION_VERSION, runId: randomUUID(), studyCondition:studyCondition||null, requestedProvider: body.provider || 'auto', provider: actualProvider,
    fallback, retrievalPasses: 1, stages: ['preferences', 'parallel-retrieval', 'plan', 'select', 'validate', 'missing-piece-suggestions'], modelProfile:personal.preferences.modelProfile, promptVersion:'stylist-rag-v4', knowledgeMode:knowledge.metadata?.mode,
    timingMs: { retrieval: Math.round(retrievalMs), selectionAndValidation: Math.round(performance.now() - generationStart), total: Math.round(performance.now() - started) } } };
}
