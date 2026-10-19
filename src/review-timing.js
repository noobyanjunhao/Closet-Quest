import {useEffect,useRef} from 'react';

export function useReviewTiming(editor,state) {
  const clock=useRef(null),stored=state.items.find(item=>item.id===editor?.id);
  const ready=Boolean(editor)&&!['submitting','queued','processing'].includes(stored?.recognition?.status);
  useEffect(()=>{
    clock.current=null;
    if(!ready)return;
    const record={id:editor.id,total:0,since:document.hidden?null:performance.now()};clock.current=record;
    const visibility=()=>{if(record.since!==null)record.total+=performance.now()-record.since;record.since=document.hidden?null:performance.now();};
    document.addEventListener('visibilitychange',visibility);
    return()=>document.removeEventListener('visibilitychange',visibility);
  },[editor?.id,ready]);
  return item=>{
    const session=state.validationSession,record=clock.current;
    if(!session?.consent||!record||record.id!==item.id||(!stored?.needsReview&&stored?.recognition?.status!=='review'))return null;
    const original=stored?.recognition?.result?.data,fields=['category','itemType','colorName','fit'];
    return {id:crypto.randomUUID(),participant:session.participant,source:session.source==='participant'&&!item.sampleId&&session.unseen?'participant':'development',createdAt:new Date().toISOString(),activeMs:Math.round(record.total+(record.since===null?0:performance.now()-record.since)),hasSuggestion:Boolean(original),changedFields:original?fields.filter(field=>String(item[field]||'').toLowerCase()!==String(original[field]||'').toLowerCase()):[],provider:stored?.recognition?.result?.pipeline?.provider||null,model:stored?.recognition?.result?.model||null,unseen:Boolean(session.unseen)};
  };
}
