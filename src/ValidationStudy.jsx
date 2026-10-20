import React,{useEffect,useRef,useState} from 'react';
import {api,downloadJson} from './photos.js';
import {Garment} from './components.jsx';
import {orderFor,measureOutfits,summarizeValidation,exportValidation} from './validation.js';
import './validation.css';

export default function ValidationStudy({state,save,account}) {
  const [participant,setParticipant]=useState(account?.id||'p01'),[source,setSource]=useState('development'),[brief,setBrief]=useState(''),[occasion,setOccasion]=useState('Campus casual'),[consent,setConsent]=useState(false),[unseen,setUnseen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[active,setActive]=useState(state.validationTrials?.at(-1)?.pairId||null);
  const controller=useRef(null), current=useRef(state);current.current=state;
  const trials=state.validationTrials||[],reviews=state.validationReviews||[],real=trials.filter(t=>t.source==='participant'),summary=summarizeValidation(real,reviews.filter(r=>r.source==='participant'));
  useEffect(()=>{
    if(state.validationTrials?.some(trial=>trial.status==='pending'))save(s=>({...s,validationTrials:s.validationTrials.map(trial=>trial.status==='pending'?{...trial,status:'cancelled',errorCode:'SESSION_INTERRUPTED'}:trial)}));
    return()=>controller.current?.abort();
  },[]);
  const updateTrial=(id,patch)=>save(s=>({...s,validationTrials:(s.validationTrials||[]).map(t=>t.id===id?{...t,...patch}:t)}));
  async function start() {
    if(!/^p\d{2,3}$/.test(participant)||!brief.trim()||!consent)return;
    if(source==='participant'&&(!unseen||state.items.some(i=>i.sampleId))) {setMessage('For a real study, use the participant’s own reviewed wardrobe, confirm unseen inputs, and remove sample pieces first. Development rehearsals can use samples.');return;}
    if(trials.length>=120){setMessage('Export the current study before collecting more than 120 trials.');return;}
    const pairId=crypto.randomUUID(),items=state.items.map(({image,originalImage,recognition,...item})=>item),order=orderFor(participant,new Set(trials.filter(t=>t.participant===participant).map(t=>t.pairId)).size);
    const rows=order.map((condition,index)=>({id:crypto.randomUUID(),pairId,participant,source,condition,label:index?'B':'A',status:'pending',createdAt:new Date().toISOString(),consent:true,unseen:source==='participant'&&unseen,wardrobeCount:items.length,temperature:trials.some(t=>t.condition===condition&&t.status==='ready')?'repeat':'first-session',outfits:[]}));
    if(!save(s=>({...s,validationTrials:[...(s.validationTrials||[]),...rows]})))return;
    setActive(pairId);setBusy(true);setMessage('Preparing two sets for the same brief. Methods stay hidden until you finish rating.');
    const abort=new AbortController();controller.current=abort;
    for(const row of rows) {
      const started=performance.now();
      try {
        abort.signal.throwIfAborted();
        const result=await api('style',{wardrobeId:state.wardrobeId,items,preferences:state.preferences,recommendationHistory:state.recommendationHistory,provider:'auto',studyCondition:row.condition,context:occasion,request:brief.trim()},'POST',{signal:abort.signal,timeoutMs:70000});
        const outfits=result.data.outfits.slice(0,3).map(look=>({itemIds:look.itemIds,accepted:null}));
        updateTrial(row.id,{status:'ready',elapsedMs:Math.round(performance.now()-started),provider:result.pipeline?.provider,model:result.model,modelFallback:Boolean(result.pipeline?.fallback),retrievalFallback:Boolean(result.retrieval?.fallback?.active)||result.retrieval?.knowledge?.metadata?.mode==='unavailable',checks:measureOutfits(outfits,items),outfits,evidenceSourceCount:result.retrieval?.promptSourceIds?.length||0,serverTiming:result.pipeline?.timingMs,display:{outfits:result.data.outfits.slice(0,3),sources:(result.retrieval?.knowledge?.sources||[]).filter(s=>result.retrieval?.promptSourceIds?.includes(s.id)).map(s=>({title:s.title,excerpt:s.excerpt}))}});
      }catch(error){updateTrial(row.id,{status:abort.signal.aborted?'cancelled':'failed',elapsedMs:Math.round(performance.now()-started),errorCode:error.code||String(error.status||'REQUEST_FAILED')});}
    }
    setBusy(false);setMessage('Rate every suggested look. A failed request remains in the attempt count.');
    for(const row of rows)updateTrial(row.id,{ratingStartedAt:Date.now()});
  }
  const shown=trials.filter(t=>t.pairId===active);
  const finished=shown.length===2&&shown.every(t=>t.status!=='pending'&&(t.status!=='ready'||!t.outfits.length||t.outfits.every(o=>typeof o.accepted==='boolean')));
  const ratio=value=>value.denominator?`${value.numerator}/${value.denominator} (${Math.round(value.value*100)}%)`:'Not measured';
  return <section className="validation-workspace">
    <div className="panel"><p className="eyebrow">SPRINT 7 · PAIRED VALIDATION</p><h2>Does it help you get dressed?</h2><p>Compare two methods on the same wardrobe and brief. Ratings are recorded separately from engineering checks. This workspace never treats a rehearsal as an independent user study.</p>
      <div className="study-fields"><label>Participant code<input value={participant} onChange={e=>setParticipant(e.target.value)} pattern="p[0-9]{2,3}" placeholder="p01" disabled={busy||Boolean(account)}/></label><label>Session type<select value={source} onChange={e=>setSource(e.target.value)} disabled={busy}><option value="development">Development rehearsal</option><option value="participant">Real participant session</option></select></label><label>Occasion<select value={occasion} onChange={e=>setOccasion(e.target.value)} disabled={busy}>{['Campus casual','Coffee date','Presentation day'].map(value=><option key={value}>{value}</option>)}</select></label></div>
      <label>A real wardrobe brief<textarea value={brief} onChange={e=>setBrief(e.target.value)} maxLength={1800} rows={3} placeholder="Describe your actual plans and what you want to wear." disabled={busy}/></label>
      <label className="study-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/>I agree to record timings and outfit ratings under this participant code. The full method may send reviewed descriptions, preferences and retrieved notes to OpenAI.</label>
      {source==='participant'&&<label className="study-check"><input type="checkbox" checked={unseen} onChange={e=>setUnseen(e.target.checked)} disabled={busy}/>These are my own clothes, unseen phone photos and a real brief, not app demonstration samples.</label>}
      <div className="toolbar"><button className="primary" onClick={start} disabled={busy||!consent||!brief.trim()||!/^p\d{2,3}$/.test(participant)}>Compare two sets</button>{busy&&<button onClick={()=>controller.current?.abort()}>Cancel comparison</button>}<button onClick={()=>downloadJson(exportValidation(trials.map(({display,...trial})=>trial),reviews),'closet-quest-validation.json')}>Export anonymized results</button></div>
      {message&&<p role="status">{message}</p>}<p className="muted">For photo correction measurements: save a session below, then add your phone photos through Closet. First-session and repeat timings are recorded separately; neither proves the hosting cache was cold or warm.</p>
      <button disabled={busy||!consent||!/^p\d{2,3}$/.test(participant)} onClick={()=>{save(s=>({...s,validationSession:{participant,source,consent:true,unseen,startedAt:new Date().toISOString()}}));setMessage('Photo-review session selected. Add and review photos in Closet.');}}>Use this session for photo reviews</button>
    </div>
    {shown.map(trial=><section className="panel study-set" key={trial.id}><h2>Set {trial.label}{finished?` · ${trial.condition==='baseline'?'Quick baseline':'Personal RAG'}`:''}</h2>{trial.status!=='ready'?<p>{trial.status==='pending'?'Preparing…':`Request ${trial.status}. It is retained in the results.`}</p>:<>{!trial.outfits.length&&<p>No complete look returned. This is an abstention, not an accepted outfit.</p>}<div className="study-looks">{trial.outfits.map((look,index)=><article key={index}><h3>Look {index+1}</h3><div className="study-photos">{look.itemIds.map(id=>state.items.find(item=>item.id===id)).filter(Boolean).map(item=><div key={item.id}><Garment item={item}/><span>{item.name}</span></div>)}</div><p>{trial.display?.outfits[index]?.explanation}</p><label>Would you wear this for your brief?<select value={look.accepted===null?'':String(look.accepted)} onChange={e=>{if(!e.target.value)return;updateTrial(trial.id,{outfits:trial.outfits.map((outfit,i)=>i===index?{...outfit,accepted:e.target.value==='true'}:outfit),decisionMs:Date.now()-trial.ratingStartedAt});}}><option value="">Choose a rating</option><option value="true">Yes, I would wear it</option><option value="false">No, I would not</option></select></label></article>)}</div>
      <details><summary>Review the supporting evidence</summary>{trial.display?.sources?.length?trial.display.sources.map((item,index)=><div key={index}><strong>{item.title}</strong><p>{item.excerpt}</p></div>):<p>No document excerpt reached this method.</p>}</details><label>How useful was the evidence?<select value={trial.evidenceUseful||''} onChange={e=>updateTrial(trial.id,{evidenceUseful:e.target.value?Number(e.target.value):null})}><option value="">Not rated / not applicable</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}{n===1?' · not useful':n===5?' · very useful':''}</option>)}</select></label></>}</section>)}
    <section className="panel"><h2>Real participant results</h2><p>{summary.participants} participants · {summary.pairedBriefs} fully rated paired briefs. Rehearsals are excluded below.</p><div className="study-metrics">{['baseline','full'].map(condition=><div key={condition}><h3>{condition==='baseline'?'Quick baseline':'Personal RAG'}</h3><p>Top-three acceptance: <strong>{ratio(summary.conditions[condition].top3Acceptance)}</strong></p><p>Rating coverage: {ratio(summary.conditions[condition].ratingCoverage)}</p><p>Model fallback: {ratio(summary.conditions[condition].modelFallback)}</p><p>Attempts: {summary.conditions[condition].attempts} · Failed: {summary.conditions[condition].failed} · Cancelled: {summary.conditions[condition].cancelled}</p></div>)}</div><p>Reviewed photos: {summary.photoReviews.count}. No measured human result is shown until a real participant supplies it.</p></section>
  </section>;
}
