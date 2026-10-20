export const STUDY_VERSION='closet-validation-v1';
export const median=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2:null;};
export function orderFor(participant, pairNumber=0) {
  const suffix=Number(participant.match(/\d+$/)?.[0]||0);
  return (suffix+pairNumber)%2?['full','baseline']:['baseline','full'];
}
export function measureOutfits(outfits,items) {
  return outfits.map(outfit=>{
    const chosen=outfit.itemIds.map(id=>items.find(item=>item.id===id));
    const categories=chosen.filter(Boolean).map(item=>item.category),count=category=>categories.filter(value=>value===category).length;
    const owned=chosen.every(Boolean),reviewed=chosen.every(item=>item&&!item.needsReview),unique=new Set(outfit.itemIds).size===outfit.itemIds.length;
    const complete=count('Shoes')===1&&((count('Top')===1&&count('Bottom')===1&&count('Dress')===0)||(count('Dress')===1&&count('Top')===0&&count('Bottom')===0));
    return {owned,reviewed,complete,valid:owned&&reviewed&&unique&&complete};
  });
}
export function summarizeValidation(trials=[],reviews=[]) {
  // Null means not observed. It must never silently become zero or a rejection.
  const records=[...new Map(trials.map(trial=>[trial.id,trial])).values()];
  const rate=(numerator,denominator)=>({numerator,denominator,value:denominator?numerator/denominator:null});
  const conditions={};
  for(const condition of ['baseline','full','no-memory']) {
    const rows=records.filter(trial=>trial.condition===condition),completed=rows.filter(trial=>trial.status==='ready');
    const rated=completed.filter(trial=>trial.outfits?.length>0&&trial.outfits.every(look=>typeof look.accepted==='boolean'));
    const valid=completed.flatMap(trial=>trial.checks||[]);
    const usefulness=rated.filter(trial=>trial.evidenceSourceCount>0).map(trial=>trial.evidenceUseful).filter(value=>Number.isInteger(value)&&value>=1&&value<=5);
    conditions[condition]={attempts:rows.length,completed:completed.length,failed:rows.filter(r=>r.status==='failed').length,cancelled:rows.filter(r=>r.status==='cancelled').length,pending:rows.filter(r=>r.status==='pending').length,
      top3Acceptance:rate(rated.filter(r=>r.outfits.some(o=>o.accepted)).length,rated.length),
      acceptancePerAttempt:rate(rated.filter(r=>r.outfits.some(o=>o.accepted)).length,rows.length),
      ratingCoverage:rate(rated.length,completed.filter(r=>r.outfits?.length).length),
      modelFallback:rate(completed.filter(r=>r.modelFallback).length,completed.length),
      retrievalFallback:rate(completed.filter(r=>r.retrievalFallback).length,completed.length),
      structuralValidity:rate(valid.filter(r=>r.valid).length,valid.length),
      medianLatencyMs:median(completed.map(r=>r.elapsedMs)),
      firstSessionMedianMs:median(completed.filter(r=>r.temperature==='first-session').map(r=>r.elapsedMs)),
      repeatMedianMs:median(completed.filter(r=>r.temperature==='repeat').map(r=>r.elapsedMs)),
      evidenceUsefulness:{median:median(usefulness),denominator:usefulness.length},
      medianDecisionMs:median(rated.map(r=>r.decisionMs)),
    };
  }
  const pairIds=[...new Set(records.map(r=>r.pairId))];
  const paired=pairIds.map(id=>['baseline','full'].map(condition=>records.find(r=>r.pairId===id&&r.condition===condition))).filter(pair=>pair.every(r=>r?.outfits?.length&&r.outfits.every(o=>typeof o.accepted==='boolean')));
  return {version:STUDY_VERSION,participants:new Set(records.filter(r=>r.source==='participant').map(r=>r.participant)).size,developmentTrials:records.filter(r=>r.source!=='participant').length,conditions,
    pairedBriefs:paired.length,pairedAcceptanceDifference:paired.length?paired.reduce((sum,[a,b])=>sum+Number(b.outfits.some(o=>o.accepted))-Number(a.outfits.some(o=>o.accepted)),0)/paired.length:null,
    photoReviews:{count:reviews.length,medianActiveReviewMs:median(reviews.map(r=>r.activeMs)),categoryCorrections:rate(reviews.filter(r=>r.hasSuggestion&&r.changedFields.includes('category')).length,reviews.filter(r=>r.hasSuggestion).length),anyCorrection:rate(reviews.filter(r=>r.hasSuggestion&&r.changedFields.length).length,reviews.filter(r=>r.hasSuggestion).length)}};
}
export function exportValidation(trials,reviews) {
  return {schemaVersion:1,protocol:STUDY_VERSION,exportedAt:new Date().toISOString(),trials,reviews,summary:summarizeValidation(trials.filter(r=>r.source==='participant'),reviews.filter(r=>r.source==='participant')),developmentSummary:summarizeValidation(trials.filter(r=>r.source!=='participant'),reviews.filter(r=>r.source!=='participant')),notes:['No photographs, original briefs, garment names, preference notes, or document content in this export.','Participant IDs are pseudonyms. Only records explicitly marked participant are human-study records.','The main summary excludes rehearsals; developmentSummary reports them separately.','First-session timing is not a verified server cold start. Repeat timing is not proof of a cache hit.']};
}
