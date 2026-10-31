import React,{useEffect,useState,useRef} from 'react';
import {api} from './photos.js';
import './purchase-import.css';

const sample='Harbor Demo Store\nNavy linen trousers, size M, quantity 1\nShipping 5.00\nDiscount -3.00';
const categories=['Top','Bottom','Dress','Shoes','Outerwear','Accessory'];
export default function PurchaseImportPanel({account,onBeforeCommit,onCommitted,onClose}){
 const [config,setConfig]=useState(null),[draft,setDraft]=useState(null),[rows,setRows]=useState([]),[recent,setRecent]=useState([]),[source,setSource]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[owned,setOwned]=useState(false),[dirty,setDirty]=useState(false);
 const createKey=useRef(crypto.randomUUID()),alive=useRef(true),storageKey=`cq-purchase-draft-${account?.id||'local'}`;
 function show(d){setDraft(d);setRows(d.items||[]);setDirty(false);setOwned(false);localStorage.setItem(storageKey,d.id);}
 async function run(fn){setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}}
 async function load(id){show(await api(`imports/${id}`,null,'GET'));}
 useEffect(()=>{alive.current=true;void run(async()=>{setConfig(await api('imports/config',null,'GET'));const r=await api('imports',null,'GET');setRecent(r.imports);const id=localStorage.getItem(storageKey);if(id&&r.imports.some(d=>d.id===id))await load(id);});return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!draft||!['queued','extracting'].includes(draft.status))return;const controller=new AbortController();let polling=false;const timer=setInterval(async()=>{if(polling)return;polling=true;try{const next=await api(`imports/${draft.id}`,null,'GET',{signal:controller.signal,timeoutMs:10000});if(alive.current){setDraft(next);if(next.status==='review_required')setRows(next.items);}}catch(e){if(!controller.signal.aborted)setError(e.message);}finally{polling=false;}},1200);return()=>{clearInterval(timer);controller.abort();};},[draft?.id,draft?.status]);
 const update=(id,field,value)=>{setRows(old=>old.map(i=>i.id===id?field==='selected'?{...i,selected:value}:{...i,reviewed:{...i.reviewed,[field]:value}}:i));setDirty(true);setOwned(false);};
 const isProcessing=['queued','extracting'].includes(draft?.status);
 return <div className="purchase-panel">
  <p className="eyebrow">PURCHASE TEXT → REVIEW → YOUR CLOSET</p>
  <p>Turn a purchase into pieces you can style. You choose what you actually own.</p>
  <div className="purchase-notice">{config?.provider==='fixture'?'Demo mode: only the synthetic examples work. No AI inference.':config?.provider==='worker'?'A private worker processes your purchase text. Text is never sent to OpenAI.':'Local AI on the app server. Text is never sent to OpenAI.'} {account?.cloud?'Drafts and source text are stored in your private cloud account.':'Drafts and source text are stored on this computer.'} Remove names, addresses and payment details before pasting. No training uses these records.</div>
  {!draft&&<>
   <label>Paste clothing purchase text<textarea aria-label="Purchase text" rows={7} maxLength={12000} value={source} onChange={e=>{setSource(e.target.value);createKey.current=crypto.randomUUID();}} placeholder={'Cotton tee, size M, quantity 2\nShipping 5.00'}/></label>
   <div className="purchase-actions"><button disabled={busy} onClick={()=>{setSource(sample);createKey.current=crypto.randomUUID();}}>Use synthetic example</button><button className="primary" disabled={busy||!source.trim()} onClick={()=>run(async()=>show(await api('imports',{source_type:'text',text:source,idempotency_key:createKey.current},'POST',{timeoutMs:15000})))}>Review purchases</button></div>
   {!!recent.length&&<details><summary>Resume an import ({recent.length})</summary>{recent.map(d=><button className="purchase-resume" key={d.id} disabled={busy} onClick={()=>run(()=>load(d.id))}>{new Date(d.createdAt).toLocaleString()} · {d.status.replaceAll('_',' ')}</button>)}</details>}
  </>}
  {draft&&<>
   <p role="status"><strong>{({queued:config?.provider==='worker'?'Saved securely. Waiting for the private worker…':'Waiting to extract your pieces…',extracting:'Finding your clothing…',review_required:'Your review makes it yours.',failed:'Extraction needs another try.',cancelled:'Import cancelled.',committed:'Pieces added. Ready to style.'})[draft.status]}</strong></p>
   {draft.status==='queued'&&config?.provider==='worker'&&<p>You can close this screen and return later. If the worker is offline, your draft stays saved.</p>}
   {draft.error&&<p role="alert">{draft.error.message}</p>}
   {draft.model?.provider==='rules'&&<p className="purchase-notice">Fast parser · the private AI worker is offline. This draft uses text rules, so double-check the details before adding it.</p>}
   {draft.status==='review_required'&&<>
    {!rows.length&&<p>No clothing was extracted. Fees and non-clothing lines stay out of your closet.</p>}
    {rows.map((item,index)=><section key={item.id} className="purchase-review-row">
     <label className="purchase-select"><input type="checkbox" checked={item.selected} onChange={e=>update(item.id,'selected',e.target.checked)}/> Include piece {index+1}</label>
     <div className="purchase-fields">
      <label>Name<input maxLength={160} value={item.reviewed.description} onChange={e=>update(item.id,'description',e.target.value)}/></label>
      <label>Category<select value={item.reviewed.category} onChange={e=>update(item.id,'category',e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      {['color','size','brand'].map(field=><label key={field}>{field[0].toUpperCase()+field.slice(1)}<input maxLength={80} placeholder="Unknown" value={item.reviewed[field]??''} onChange={e=>update(item.id,field,e.target.value||null)}/></label>)}
      <label>Quantity<input type="number" min="1" max="10" step="1" placeholder="Required" value={item.reviewed.quantity??''} onChange={e=>update(item.id,'quantity',e.target.value===''?null:Number(e.target.value))}/></label>
     </div>
     <details><summary>Source evidence & review notes</summary>{item.prediction.evidence.map((e,i)=><p key={i}><b>{e.field}</b> · {e.line_id}: “{e.quote}”</p>)}{item.prediction.review_reasons.map((r,i)=><p key={i}>{r}</p>)}<p>Category is interpreted from the quoted clothing type. New details you supply are recorded separately from the extraction.</p></details>
    </section>)}
    {!!draft.extraction?.excluded_lines.length&&<details><summary>Excluded lines ({draft.extraction.excluded_lines.length})</summary>{draft.extraction.excluded_lines.map((e,i)=><p key={i}>{e.line_id} · {e.reason}: {draft.source.lines.find(l=>l.id===e.line_id)?.text}</p>)}</details>}
    {draft.extraction?.warnings?.map((w,i)=><p key={i}>{w}</p>)}
    {!!rows.length&&<><button disabled={busy} onClick={()=>run(async()=>show(await api(`imports/${draft.id}/items`,{expected_revision:draft.revision,items:rows.map(({id,reviewed,selected})=>({id,reviewed,selected}))},'PATCH')))}>Save my review</button>
    <label className="purchase-select"><input type="checkbox" checked={owned} disabled={dirty||rows.some(i=>i.selected&&!i.reviewedAt)} onChange={e=>setOwned(e.target.checked)}/> I own the selected pieces and want to add each unit to my closet.</label>
    <button className="primary" disabled={busy||dirty||!owned||!rows.some(i=>i.selected)} onClick={()=>run(async()=>{await onBeforeCommit();const result=await api(`imports/${draft.id}/commit`,{expected_revision:draft.revision,selected_item_ids:rows.filter(i=>i.selected).map(i=>i.id),confirm_owned:true,idempotency_key:`commit-${draft.id}-${draft.revision}`});await onCommitted(result);localStorage.removeItem(storageKey);onClose();})}>Add selected pieces</button></>}
   </>}
   {draft.status==='failed'&&<button disabled={busy} onClick={()=>run(async()=>show(await api(`imports/${draft.id}/retry`,{expected_revision:draft.revision})))}>Retry extraction</button>}
   {draft.status==='committed'&&<button className="primary" disabled={busy} onClick={()=>run(async()=>{await onBeforeCommit();await onCommitted(draft.commitResult);onClose();})}>Open imported pieces in my closet</button>}
   {!['committed','cancelled'].includes(draft.status)&&<button disabled={busy} onClick={()=>run(async()=>show(await api(`imports/${draft.id}/cancel`,{expected_revision:draft.revision})))}>Cancel import</button>}
   {!isProcessing&&<div className="purchase-actions"><button disabled={busy} onClick={()=>{setDraft(null);setSource('');createKey.current=crypto.randomUUID();localStorage.removeItem(storageKey);}}>Another purchase</button><button disabled={busy} onClick={()=>run(async()=>{await api(`imports/${draft.id}`,null,'DELETE');setDraft(null);localStorage.removeItem(storageKey);setRecent(r=>r.filter(x=>x.id!==draft.id));})}>{draft.status==='committed'?'Remove source text (keep clothes)':'Delete draft & source'}</button></div>}
   {!!draft.source?.lines?.length&&<details><summary>Original source & model details</summary><pre>{draft.source.lines.map(l=>`${l.id}: ${l.text}`).join('\n')}</pre><p>{draft.model?.provider||draft.provider} · {draft.model?.model||'Not extracted'} · revision {draft.revision}</p></details>}
  </>}
  {error&&<div role="alert" className="purchase-error">{error}{draft&&<button onClick={()=>run(()=>load(draft.id))}>Reload latest review</button>}</div>}
 </div>;
}
