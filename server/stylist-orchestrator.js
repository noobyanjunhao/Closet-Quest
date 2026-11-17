import {PipelineError} from './recognition.js';

export const ORCHESTRATOR_VERSION='bounded-specialists-v1';
// These are bounded application specialists, not extra model instances.
export const SPECIALISTS=Object.freeze(['preference-filter','wardrobe-retriever','document-retriever','outfit-planner','style-selector','ownership-validator']);
const genericBriefs=new Set(['','create a balanced outfit for my plans','give me an outfit','suggest an outfit','style me','what should i wear']);

export function selectStylistRoute({requestedProvider='auto',availableProvider,personal,studyCondition,policy=process.env.CLOSET_STYLIST_POLICY||'standard'}){
  if(!['standard','offline'].includes(policy))throw new PipelineError('The stylist policy needs a valid server configuration.',{status:503,code:'INVALID_STYLIST_POLICY'});
  const brief=personal.request.toLowerCase().trim().replace(/[.!?]+$/,'');
  let provider=availableProvider,reason='explicit-provider';
  if(policy==='offline'){provider='quick';reason='server-offline-policy';}
  else if(studyCondition){reason='controlled-study';}
  else if(requestedProvider==='auto'){
    if(availableProvider==='quick')reason='no-cloud-provider';
    else if(personal.preferences.modelProfile==='fast'&&genericBriefs.has(brief)&&!personal.preferences.notes&&!personal.history.length){provider='quick';reason='routine-brief';}
    else reason='personalized-brief';
  }
  return {version:ORCHESTRATOR_VERSION,policy,provider,reason,specialists:[...SPECIALISTS],maxGenerationCalls:provider==='quick'?0:1,parallelRetrieval:true};
}

// Safe operational metadata only. Never log request text, photos or personal notes.
export function orchestrationTrace(route,{actualProvider,fallback,retrievalMs,totalMs,knowledgeMode,outfits}){
  return {...route,actualProvider,generationAttempts:route.provider==='quick'?0:1,
    stages:[
      {specialist:'preference-filter',status:'complete'},
      {specialist:'wardrobe-retriever',status:'complete',elapsedGroupMs:retrievalMs},
      {specialist:'document-retriever',status:knowledgeMode==='unavailable'?'degraded':knowledgeMode==='not-requested'?'skipped':'complete'},
      {specialist:'outfit-planner',status:'complete'},
      {specialist:'style-selector',status:fallback?'fallback':'complete'},
      {specialist:'ownership-validator',status:'complete',returnedOutfits:outfits.length}
    ],totalMs};
}
