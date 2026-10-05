import { normalizePreferences, preferenceText } from '../src/preferences.js';
import { validateStyleRequest } from './retrieval.js';
import { PipelineError } from './recognition.js';

const words=value=>String(value||'').toLowerCase().match(/[a-z0-9]+/g)||[];
const contains=(text,term)=>words(term).every(word=>words(text).includes(word));
export function personalizeRequest(body) {
  const validated=validateStyleRequest(body);
  const preferences=normalizePreferences(body.preferences);
  const excluded=validated.items.filter(item=>preferences.avoidColors.some(color=>contains(item.colorName,color)));
  if(excluded.some(item=>item.id===validated.anchorId))throw new PipelineError('Your starting piece has a color you chose to avoid. Change My style or choose another piece.',{code:'PREFERENCE_ANCHOR_CONFLICT',status:400});
  const items=validated.items.filter(item=>!excluded.includes(item));
  if(!items.length)throw new PipelineError('No reviewed wardrobe choices remain after your color exclusions. Update My style or add another piece.',{code:'PREFERENCE_NO_ITEMS',status:400});
  const owned=new Set(items.map(item=>item.id));
  const history=(Array.isArray(body.recommendationHistory)?body.recommendationHistory:[]).slice(-30).flatMap(run=>{
    if(!run||!['helpful','not-for-me'].includes(run.feedback)||!Array.isArray(run.chosenItemIds))return [];
    const ids=[...new Set(run.chosenItemIds)].filter(id=>typeof id==='string'&&owned.has(id)).slice(0,8);
    return ids.length?[{feedback:run.feedback,itemIds:ids}]:[];
  });
  return {...validated,items,preferences,preferenceSummary:preferenceText(preferences).slice(0,600),history,excludedIds:excluded.map(i=>i.id)};
}

export function applyPreferenceScores(prepared,personal) {
  const {preferences,history}=personal;
  const scale=Math.max(1,...prepared.retrieval.items.map(entry=>Math.max(0,entry.score||0)));
  const evidence=[];
  const ranked=prepared.retrieval.items.map(entry=>{
    const item=prepared.items.find(i=>i.id===entry.id);if(!item)return entry;
    const reasons=[];let boost=0;
    if(preferences.colors.some(color=>contains(item.colorName,color))){boost+=.25;reasons.push('Preferred recorded color');}
    const text=[item.name,item.tags,item.styleTags,item.pattern,item.fit].join(' ');
    if(preferences.styles.some(style=>contains(text,style))){boost+=.2;reasons.push('Matches selected style');}
    if(preferences.fit!=='Any'&&contains(item.fit,preferences.fit)){boost+=.15;reasons.push('Preferred recorded fit');}
    const votes=history.filter(run=>run.itemIds.includes(item.id));
    const feedback=Math.max(-.15,Math.min(.15,votes.reduce((sum,run)=>sum+(run.feedback==='helpful'?.05:-.05),0)));
    if(feedback){boost+=feedback;reasons.push(feedback>0?'Previously liked piece':'Less emphasis after feedback');}
    if(boost)evidence.push({itemId:item.id,boost,reasons});
    return {...entry,score:Math.max(0,(entry.score||0)+boost*scale),preferenceReasons:reasons};
  }).sort((a,b)=>b.score-a.score);
  return {...prepared,retrieval:{...prepared.retrieval,items:ranked,personalization:{version:'preferences-v1',summary:personal.preferenceSummary,excludedIds:personal.excludedIds,feedbackRuns:history.length,scoredItems:evidence,method:'Explicit color exclusion; bounded preference and feedback score adjustments, not model training'}}};
}
