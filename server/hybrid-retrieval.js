import {prepareWardrobeRetrieval,selectWardrobeCandidates} from './retrieval.js';
import {createEmbeddingClient,cosineSimilarity,garmentEmbeddingText,queryEmbeddingText,EMBEDDING_MODEL} from './embeddings.js';
import {rerankCandidates} from './reranker.js';

export const HYBRID_RETRIEVAL_VERSION='wardrobe-hybrid-v1.1';
const RRF_K=60;
const BRANCH_LIMIT=60;
const round=value=>Number(value.toFixed(6));
const genericCategoryTerms=new Set(['top','bottom','dress','shoes','footwear','outerwear','accessory','accessories','clothing','clothes','garment','garments','item','items']);

export function fuseWardrobeRanks(lexicalEntries,denseScores) {
  const denseRanked=[...lexicalEntries].sort((a,b)=>denseScores.get(b.item.id)-denseScores.get(a.item.id)||a.index-b.index);
  const denseRanks=new Map(denseRanked.map((entry,index)=>[entry.item.id,index+1]));
  // Category-only matches should not give many generic records an extra vote over specific dense matches.
  // Category coverage is enforced after fusion; retain the original BM25 score/rank for inspection.
  const informativeLexical=lexicalEntries.filter(entry=>entry.score>0&&entry.matches.some(term=>!genericCategoryTerms.has(term)));
  const fusionLexicalRanks=new Map(informativeLexical.map((entry,index)=>[entry.item.id,index+1]));
  return lexicalEntries.map((entry,index)=>{
    const lexicalRank=entry.score>0?index+1:null;
    const fusionLexicalRank=fusionLexicalRanks.get(entry.item.id)||null;
    const denseRank=denseRanks.get(entry.item.id);
    const rrfScore=(fusionLexicalRank&&fusionLexicalRank<=BRANCH_LIMIT?1/(RRF_K+fusionLexicalRank):0)+(denseRank<=BRANCH_LIMIT?1/(RRF_K+denseRank):0);
    return {id:entry.item.id,item:entry.item,bm25Score:entry.score,lexicalRank,fusionLexicalRank,denseScore:denseScores.get(entry.item.id),denseRank,rrfScore};
  });
}

export async function retrieveWardrobeHybrid(inputItems,options={},dependencies={}) {
  options={...options,signal:options.signal||dependencies.signal};
  const state=prepareWardrobeRetrieval(inputItems,options);
  // Fail impossible/invalid requests before model discovery or any embedding work.
  const lexical=selectWardrobeCandidates(state);
  options.signal?.throwIfAborted();
  if(dependencies.enabled===false)return {...lexical,retrieval:{...lexical.retrieval,version:HYBRID_RETRIEVAL_VERSION,method:'BM25 + explicit synonyms + category coverage (dense disabled)',embedding:{available:false,model:dependencies.model||EMBEDDING_MODEL},fallback:{active:true,code:'EMBEDDING_DISABLED',reason:'Text embeddings are disabled for this request.'},reranker:{active:false,reason:'No dense retrieval was run.'}}};
  let embedded;
  try {
    const client=dependencies.embeddingClient||createEmbeddingClient(dependencies);
    embedded=await client.embed([
      {kind:'query',text:queryEmbeddingText(state.request,state.context)},
      ...state.eligible.map(item=>({kind:'garment',text:garmentEmbeddingText(item)})),
    ],{signal:options.signal});
    if(!Array.isArray(embedded.vectors)||embedded.vectors.length!==state.eligible.length+1)throw new Error('Embedding result count does not match the wardrobe.');
    const denseScores=new Map(state.eligible.map((item,index)=>[item.id,cosineSimilarity(embedded.vectors[0],embedded.vectors[index+1])]));
    const candidates=fuseWardrobeRanks(state.ranked,denseScores);
    const rerank=dependencies.rerankCandidates||rerankCandidates;
    let reranked;
    try { reranked=await rerank({items:state.eligible,candidates,request:state.request,context:state.context,anchorId:state.anchorId,requireLowUse:state.requireLowUse},dependencies.rerankerOptions||{})||{}; }
    catch(error) { if(options.signal?.aborted)throw options.signal.reason;reranked={scores:[],metadata:{active:false,reason:'The optional learned reranker failed; reciprocal rank fusion is still active.'}}; }
    options.signal?.throwIfAborted();
    const learned=new Map((Array.isArray(reranked.scores)?reranked.scores:[]).filter(entry=>entry&&candidates.some(candidate=>candidate.id===entry.id)&&Number.isFinite(entry.score)).map(entry=>[entry.id,entry.score]));
    const active=reranked.metadata?.active===true&&learned.size===candidates.length;
    const maxFusion=Math.max(...candidates.map(candidate=>candidate.rrfScore),1e-9);
    const learnedValues=[...learned.values()];
    const minimumLearned=active?Math.min(...learnedValues):0,maximumLearned=active?Math.max(...learnedValues):0;
    const scored=candidates.map(candidate=>({...candidate,
      score:active&&maximumLearned>minimumLearned?10*(0.8*candidate.rrfScore/maxFusion+0.2*(learned.get(candidate.id)-minimumLearned)/(maximumLearned-minimumLearned)):candidate.rrfScore*100,
      ...(active?{learnedScore:learned.get(candidate.id)}:{}),
    }));
    const byId=new Map(scored.map(candidate=>[candidate.id,candidate]));
    const ranked=state.ranked.map(entry=>{
      const candidate=byId.get(entry.item.id);
      return {...entry,score:candidate.score,evidence:{bm25Score:round(candidate.bm25Score),lexicalRank:candidate.lexicalRank,fusionLexicalRank:candidate.fusionLexicalRank,denseScore:round(candidate.denseScore),denseRank:candidate.denseRank,rrfScore:round(candidate.rrfScore),...(active?{learnedScore:round(candidate.learnedScore)}:{})},reasons:[`Text embedding similarity rank ${candidate.denseRank} of ${state.eligible.length}`]};
    }).sort((a,b)=>b.score-a.score||a.index-b.index);
    return selectWardrobeCandidates(state,ranked,{
      version:HYBRID_RETRIEVAL_VERSION,
      method:`BM25 + dense cosine + reciprocal rank fusion${active?' + experimental learned blend':''} + category coverage`,
      embedding:embedded.metadata,
      fusion:{method:'reciprocal-rank-fusion',k:RRF_K,branchLimit:BRANCH_LIMIT,lexicalCount:candidates.filter(candidate=>candidate.fusionLexicalRank&&candidate.fusionLexicalRank<=BRANCH_LIMIT).length,genericLexicalIgnoredCount:candidates.filter(candidate=>candidate.lexicalRank&&!candidate.fusionLexicalRank).length,denseCount:Math.min(BRANCH_LIMIT,candidates.length)},
      fallback:{active:false},
      reranker:{...reranked.metadata,active,...(active?{blend:{rrf:0.8,learned:0.2},blendEvaluation:'Unmeasured on real wardrobe relevance and preferences.'}:{})},
      candidates:scored.map(({item,...candidate})=>Object.fromEntries(Object.entries(candidate).map(([key,value])=>[key,typeof value==='number'?round(value):value]))),
    });
  }catch(error) {
    if(options.signal?.aborted)throw options.signal.reason;
    return {...lexical,retrieval:{...lexical.retrieval,version:HYBRID_RETRIEVAL_VERSION,method:'BM25 + explicit synonyms + category coverage (dense unavailable)',embedding:error.metadata||{available:false,model:dependencies.model||EMBEDDING_MODEL},fallback:{active:true,code:error.code||'EMBEDDING_UNAVAILABLE',reason:error.message||'Local text embeddings are unavailable.'},reranker:{active:false,reason:'Learned reranking was skipped for lexical fallback.'},timingMs:Number((performance.now()-state.start).toFixed(2))}};
  }
}
