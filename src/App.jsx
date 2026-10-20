import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createPageNavigator } from './page-motion.js';
import { createNavigationMemory } from './navigation-memory.js';
import { categories, contexts, quests, completeQuest, listing } from './logic.js';
import { rankOutfits } from './recommender.js';
import { addPhotoCollection, deleteGarment, migrateState, newPhotoState, recognitionPatch, recordWear, recordWearToday, wornToday, saveLook, undoLastWear } from './wardrobe.js';
import { api, downloadJson, imageData, preparePhoto, cropPhoto } from './photos.js';
import PhotoDetections from './PhotoDetections.jsx';
import { detectionCrop, detectionDrafts, insertDetectionDrafts } from './photo-import.js';
import { Credits, Garment, GarmentCard, Modal, PhotoCredit } from './components.jsx';
import Feasibility from './Feasibility.jsx';
import PhotoEvidence from './PhotoEvidence.jsx';
import RagEvidence from './RagEvidence.jsx';
import MLStatus from './MLStatus.jsx';
import OutfitStudio from './OutfitStudio.jsx';
import CameraCapture from './CameraCapture.jsx';
import DepopConnection from './DepopConnection.jsx';
import { prefillReview } from './camera.js';
import { ClosetHero } from './Editorial.jsx';
import photoSources from '../public/photos/sources.json';
import './style.css';
import './workspace.css';
import './editorial.css';
import './studio.css';
import './simple-flow.css';
import './capture-flow.css';
import './journey.css';
import { ClosetCheck, FavoriteQuest, Inspiration } from './Journey.jsx';
import GarmentDisplay from './GarmentDisplay.jsx';
import WardrobeRail from './WardrobeRail.jsx';
import { roleplayState } from './roleplay.js';
import { alphaDemoState } from './alpha-demo.js';
import StyleMemory from './PersonalStyle.jsx';
import { normalizePreferences } from './preferences.js';
import FluidNavigation from './FluidNavigation.jsx';
import ValidationStudy from './ValidationStudy.jsx';
import {useReviewTiming} from './review-timing.js';
import './fluid.css';
import {createSyncQueue,prepareCloudSnapshot} from './cloud-sync.js';
import WelcomeFlow from './WelcomeFlow.jsx';
import './mobile-app.css';
import './phone-experience.css';
import './wardrobe-display.css';

const ROLEPLAY = new URLSearchParams(location.search).get('demo') === 'roleplay';
const ALPHA = new URLSearchParams(location.search).get('demo') === 'sprint6';
const KEY = ALPHA ? 'closet-quest-sprint6-v1' : ROLEPLAY ? 'closet-quest-roleplay-v1' : 'closet-quest-demo-v1';
const pending = recognition => ['submitting','queued','processing'].includes(recognition?.status);
function load(storageKey=KEY,account) {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return migrateState(JSON.parse(stored));
  } catch { /* Keep the previous storage untouched until a successful user save. */ }
  const fresh=ALPHA ? alphaDemoState() : ROLEPLAY ? roleplayState() : newPhotoState();
  return account?{...fresh,preferences:{recognitionProvider:'openai',recommendationProvider:'auto',embeddingProvider:'openai'},learningEnabled:false}:fresh;
}
const dateLabel = date => new Date(date).toLocaleDateString(undefined,{ month:'short', day:'numeric' });


export default function App({account,onSignOut,initialState,cloudRevision=0,resumeSync=false}) {
  const ALPHA=!account?.cloud&&new URLSearchParams(location.search).get('demo')==='sprint6';
  const ROLEPLAY=!account?.cloud&&new URLSearchParams(location.search).get('demo')==='roleplay';
  const storageKey=account?`${KEY}-${account.id}`:KEY;
  const [state,setState] = useState(()=>initialState||load(storageKey,account)), stateRef = useRef(state); stateRef.current = state;
  const [syncStatus,setSyncStatus]=useState({phase:'saved'}),sync=useRef(null),syncTimer=useRef(null),photoCache=useRef(new Map());
  const [backupImport,setBackupImport]=useState(null);
  if(account?.cloud&&!sync.current)sync.current=createSyncQueue({revision:cloudRevision,
    prepare:s=>prepareCloudSnapshot(s,image=>api('cloud/photos',{image}),photoCache.current),
    write:(state,revision)=>api('cloud/closet',{state,revision}),
    persist:value=>value?localStorage.setItem(`cq-cloud-pending-${account.id}`,JSON.stringify(value)):localStorage.removeItem(`cq-cloud-pending-${account.id}`),
    onStatus:setSyncStatus,onCommitted:s=>{stateRef.current=s;setState(s);}});
  useEffect(()=>{if(resumeSync&&sync.current){sync.current.enqueue(stateRef.current);void sync.current.flush().catch(()=>{});}return()=>{clearTimeout(syncTimer.current);sync.current?.close();};},[]);
  useEffect(()=>{const warn=e=>{if(sync.current?.pending){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  async function signOut(){try{if(sync.current?.pending)await sync.current.flush();await onSignOut();}catch(e){notify('Your changes are not synced yet. Retry sync or export a backup before signing out.');}}
  const preferences=normalizePreferences(state.preferences);
  const [page,setPageState] = useState('Closet'), [filter,setFilter] = useState('All'), [search,setSearch] = useState(''), [sort,setSort] = useState('added');
  const [returningPage,setReturningPage]=useState(false),routeMemory=useRef(null);
  if(!routeMemory.current)routeMemory.current=createNavigationMemory();
  const [studioView,setStudioView]=useState({resultKey:'',briefOpen:true,matchesOpen:false,evidenceOpen:false,cardOpen:false,returnToCard:false});
  const outfitScroll=useRef(0),categoryScroll=useRef(0),savedRailScroll=useRef(0);
  const navigate = useRef(null);
  if (!navigate.current) navigate.current = createPageNavigator({
    commit: destination => {
      const next=routeMemory.current.move(destination,{x:window.scrollX,y:window.scrollY});
      if(!next.changed)return;
      flushSync(()=>{setReturningPage(next.returning);setPageState(destination);});
      window.scrollTo({left:next.position.x,top:next.position.y,behavior:'instant'});
    },
    startTransition: document.startViewTransition?.bind(document),
    reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  const setPage = destination => navigate.current(destination);
  const [editor,setEditor] = useState(null), [resale,setResale] = useState(null), [modal,setModal] = useState(null), [toast,setToast] = useState(''), [busy,setBusy] = useState(false);
  const measureReview=useReviewTiming(editor,state);
  const [ai,setAi] = useState({ready:false,model:'gemma3:4b'}), [engine,setEngine] = useState('agent'), [styling,setStyling] = useState(false);
  const recognitionReady=preferences.recognitionProvider==='openai'?ai.openai?.configured:(ai.localRecognitionReady??ai.recognitionReady);
  const [context,setContext] = useState(contexts[0]), [request,setRequest] = useState('Something relaxed and put together. Find a fresh combination of colors and textures.');
  const [options,setOptions] = useState([]), [selected,setSelected] = useState(0), [styleMessage,setStyleMessage] = useState(''), [questId,setQuestId] = useState('rediscover'), [questMode,setQuestMode] = useState(false);
  const [lookName,setLookName] = useState('');


  const [feedback,setFeedback] = useState({});
  const [moreOpen,setMoreOpen] = useState(false), [reviewQueue,setReviewQueue] = useState(false);
  const [anchorId,setAnchorId] = useState(''), [retrieval,setRetrieval] = useState(null), [retrievalError,setRetrievalError] = useState(''), [previewing,setPreviewing] = useState(false), [styleStage,setStyleStage] = useState('');
  const retrievalRun = useRef(0);
  const styleController = useRef(null);
  const previewController = useRef(null);
  const moreTrigger = useRef(null);
  const styleRun = useRef(0), uploadInput = useRef(null), editorRef = useRef(editor); editorRef.current = editor;
  useEffect(()=>{setEngine(preferences.recommendationProvider==='auto'?'agent':preferences.recommendationProvider);clearStudio();},[JSON.stringify(state.preferences)]);
  useEffect(() => { setMoreOpen(false); },[page]);
  function notify(message) { setToast(message); }
  async function exportBackup(){
    const backup=structuredClone(stateRef.current);
    try{
      notify('Preparing your backup with photos…');
      for(const item of backup.items)for(const field of ['image','originalImage','cutoutImage'])if(item[field]?.startsWith('/api/cloud/photos/'))item[field]=await imageData(item[field],{preserve:true});
      downloadJson(backup,'closet-quest-backup.json');notify('Closet and photos exported. Keep this file private.');
    }catch{downloadJson(stateRef.current,'closet-quest-backup.json');notify('Details exported. Cloud photos could not be downloaded; this backup keeps their account links.');}
  }
  async function readBackup(event){
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>50000000)throw Error('Choose a backup under 50 MB.');
      const imported=migrateState(JSON.parse(await file.text()));
      if(imported.items.length>300||imported.items.some(item=>!item||typeof item.id!=='string'||typeof item.name!=='string'))throw Error('This wardrobe backup is not valid.');
      setBackupImport(imported);setModal('import-backup');
    }catch(error){notify(error.message);}event.target.value='';
  }
  function closeMore() { moreTrigger.current?.focus();setMoreOpen(false); }
  function learningEvent(event) {
    if(stateRef.current.learningEnabled===false)return Promise.resolve();
    // Persist the migration's local identity before recording feedback against it.
    if(!save({...stateRef.current}))return Promise.reject(new Error('Save your wardrobe before recording learning feedback.'));
    return api('learning/events',{wardrobeId:stateRef.current.wardrobeId,...event},'POST',{timeoutMs:10000});
  }
  function save(update) {
    try {
      const next = typeof update === 'function' ? update(stateRef.current) : update;
      if (next === stateRef.current) return true;
      if(sync.current){sync.current.enqueue(next);clearTimeout(syncTimer.current);syncTimer.current=setTimeout(()=>void sync.current.flush().catch(()=>{}),600);}
      else localStorage.setItem(storageKey,JSON.stringify(next));
      stateRef.current = next; setState(next); return true;
    } catch (error) { notify(error.name === 'QuotaExceededError' ? 'Browser storage is full. Export a backup, then remove an unused photo or use a smaller image.' : error.message || 'Your change could not be saved.'); return false; }
  }
  useEffect(() => {
    let alive = true;
    const check = () => api('status',null,'GET').then(result => { if(alive)setAi(result); }).catch(() => {if(alive)setAi({ready:false,model:'gemma3:4b'});});
    check(); const timer = setInterval(check,10000); return () => {alive=false;clearInterval(timer);};
  },[]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''),6500); return () => clearTimeout(timer); },[toast]);
  // A metadata/photo edit invalidates styling; a wear or recognition status update does not.
  const wardrobeSignature = JSON.stringify(state.items.map(({id,name,category,color,colorName,tags,photoKey,pattern,fit,materialAppearance,needsReview}) => ({id,name,category,color,colorName,tags,photoKey,pattern,fit,materialAppearance,needsReview})));
  useEffect(() => { clearStudio(); if(anchorId&&!state.items.some(i=>i.id===anchorId&&!i.needsReview))setAnchorId(''); },[wardrobeSignature]);
  useEffect(() => {
    let alive = true, polling = false;
    async function poll() {
      if (polling) return;
      polling = true;
      try {
        const current = stateRef.current.items.filter(i => pending(i.recognition));
        const updates = await Promise.all(current.map(async item => {
          const r = item.recognition;
          if (!r.jobId) return Date.now() - r.startedAt > 60000 ? {id:item.id,photoKey:item.photoKey,recognition:{status:'failed',error:'The upload was interrupted. Retry this photo.'}} : null;
          try {
            const job = await api(`jobs/${r.jobId}`,null,'GET');
            const recognition = {...r,status:job.status==='ready'?'review':job.status,stage:job.stage,attempt:job.attempt,position:job.position,result:job.result,error:job.error,errorCode:job.errorCode};
            return {id:item.id,photoKey:item.photoKey,jobId:r.jobId,recognition};
          } catch(error) { return {id:item.id,photoKey:item.photoKey,jobId:r.jobId,recognition:{...r,status:error.retryable?r.status:'failed',error:error.message}}; }
        }));
        if (!alive || !updates.some(Boolean)) return;
        save(s => ({...s,items:s.items.map(item => {
          const update = pending(item.recognition) && updates.find(u => u?.id===item.id && u.photoKey===item.photoKey && (!u.jobId || u.jobId===item.recognition?.jobId));
          return update ? {...item,recognition:update.recognition} : item;
        })}));
      } finally {polling=false;}
    }
    poll(); const timer=setInterval(poll,2000); return () => {alive=false;clearInterval(timer);};
  },[]);

  async function analyze(item, detectionMode=item?.needsReview?'multiple':'single') {
    if (!item?.image || pending(stateRef.current.items.find(i=>i.id===item.id)?.recognition)) return;
    const photoKey = item.photoKey || crypto.randomUUID();
    if(!save(s => ({...s,items:s.items.map(i => i.id===item.id ? {...i,photoKey,recognition:{status:'submitting',startedAt:Date.now()}} : i)})))return;
    setEditor(current=>current?.id===item.id?{...current,appliedSuggestions:false}:current);
    let job;
    try {
      job = await api('jobs',{image:await imageData(item.image),detectionMode,provider:preferences.recognitionProvider,modelProfile:preferences.modelProfile,wardrobeId:stateRef.current.wardrobeId});
      if(!stateRef.current.items.some(i => i.id===item.id && i.photoKey===photoKey)) {await api(`jobs/${job.id}`,null,'DELETE');return;}
      if(!save(s => ({...s,items:s.items.map(i => i.id===item.id && i.photoKey===photoKey ? {...i,recognition:{status:job.status,jobId:job.id,detectionMode,startedAt:Date.now()}} : i)}))) await api(`jobs/${job.id}`,null,'DELETE');
    } catch(error) {save(s => ({...s,items:s.items.map(i => i.id===item.id && i.photoKey===photoKey ? {...i,recognition:{status:'failed',error:error.message}} : i)}));}
  }
  async function cancelAnalysis(item, recognition) {
    try {
      await api(`jobs/${recognition.jobId}`,null,'DELETE');
      save(s=>({...s,items:s.items.map(i=>i.id===item.id && i.photoKey===item.photoKey && i.recognition?.jobId===recognition.jobId ? {...i,recognition:{...i.recognition,status:'cancelled',stage:'cancelled'}} : i)}));
    } catch(error) { notify(error.message); }
  }
  async function reviewDetectedPieces(selections) {
    const source=stateRef.current.items.find(i=>i.id===editorRef.current?.id),recognition=source?.recognition;
    if(!source||recognition?.status!=='review'||!recognition.result?.garments)return;
    setBusy(true);
    try {
      const images=await Promise.all(selections.map(index=>cropPhoto(source.image,detectionCrop(recognition.result,recognition.result.garments[index]))));
      if(editorRef.current?.id!==source.id||editorRef.current?.photoKey!==source.photoKey)return;
      const drafts=detectionDrafts(source,recognition.result,selections,images);
      if(save(s=>insertDetectionDrafts(s,source,recognition.jobId,drafts))){setReviewQueue(true);setEditor({...drafts[0],appliedSuggestions:true});notify(`${drafts.length} separate pieces ready. Check each one before saving.`);}
    }catch(error){notify(error.message);}finally{setBusy(false);}
  }
  function newGarment() { setModal(null); setReviewQueue(false); setEditor({id:crypto.randomUUID(),name:'',category:'Top',color:'#a0a18f',tags:'Campus casual',wears:0,isNew:true}); }
  function reviewImports() { const next=stateRef.current.items.find(i=>i.needsReview||i.recognition?.status==='review'); if(next){setReviewQueue(true);setEditor({...next});} }
  function closeEditor() { setEditor(null);setReviewQueue(false); }
  async function upload(file) {
    if(!file)return;
    const id=editorRef.current?.id; setBusy(true);
    try {
      const image=await preparePhoto(file);
      setEditor(e => e?.id===id ? {...e,image,originalImage:undefined,cutoutImage:undefined,cutoutMethod:undefined,displayMode:'photo',backgroundCleaned:false,photoKey:crypto.randomUUID(),sampleId:undefined,recognition:undefined,name:e.name||file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ').slice(0,80)} : e);
    }catch(error){notify(error.message);}finally{setBusy(false);}
  }
  async function batchUpload(files) {
    if(!files.length)return;
    const selectedFiles = [...files].slice(0,8); setBusy(true);let added=0;const failures=[];
    try {
      for (const file of selectedFiles) {
        try {
          const image = await preparePhoto(file);
          const item = {id:crypto.randomUUID(),photoKey:crypto.randomUUID(),image,name:file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ').slice(0,80),category:'Top',color:'#a0a18f',tags:'Campus casual',wears:0,addedAt:new Date().toISOString(),needsReview:true};
          if(!save(s => ({...s,items:[...s.items,item]})))break;
          if(!added&&!editorRef.current){setReviewQueue(true);setEditor({...item});}
          added++; if(recognitionReady)await analyze(item);
        } catch(error) {failures.push(`${file.name}: ${error.message}`);}
      }
      if(added||failures.length)notify(`${added} photo${added===1?'':'s'} added. ${failures.length?failures[0]:recognitionReady?'Review the suggested details before saving.':'Check the name and category to finish adding each piece.'}${files.length>8?' Add the remaining photos in another batch.':''}`);
    }finally{setBusy(false);if(uploadInput.current)uploadInput.current.value='';}
  }
  function saveEditor(e) {
    e.preventDefault(); const {isNew,appliedSuggestions,...draft}=editor;
    if(!draft.name.trim())return;
    const previous = stateRef.current.items.find(i=>i.id===draft.id);
    const changedPhoto = previous?.photoKey!==draft.photoKey;
    const savedRecognition = appliedSuggestions ? draft.recognition : !changedPhoto && previous ? previous.recognition : draft.recognition;
    const recognition = savedRecognition?.status==='review' ? {...savedRecognition,status:'reviewed'} : savedRecognition;
    const item = {...previous,...draft,name:draft.name.trim(),wears:previous?.wears??draft.wears,recognition,needsReview:false,addedAt:previous?.addedAt||new Date().toISOString()};
    const review=measureReview(item);
    if(save(s => ({...s,items:isNew?[...s.items,item]:s.items.map(i=>i.id===item.id?item:i),...(review?{validationReviews:[...(s.validationReviews||[]),review]}:{})}))) {
      const original=savedRecognition?.result;
      if(!changedPhoto&&original?.data&&original.pipeline?.inputSha256){
        const fields=value=>Object.fromEntries(['category','itemType','colorName','fit'].filter(key=>typeof value[key]==='string').map(key=>[key,value[key]]));
        void learningEvent({type:'recognition_correction',source:item.sampleId?'sample':'user',itemId:item.id,photoSha256:original.pipeline.inputSha256,before:fields(original.data),after:fields(item),reviewed:true,model:original.model,pipelineVersion:original.pipeline.version}).catch(()=>notify('Piece saved. Local learning could not record the correction.'));
      }
      if(changedPhoto && previous?.recognition?.jobId)api(`jobs/${previous.recognition.jobId}`,null,'DELETE').catch(()=>{});
      const nextReview=reviewQueue&&stateRef.current.items.find(i=>i.id!==item.id&&(i.needsReview||i.recognition?.status==='review'));
      if(nextReview){setEditor({...nextReview});notify('Saved. Review the next piece.');}
      else {closeEditor();notify(reviewQueue?'All pieces reviewed. Your closet is ready.':'Garment saved.');}
      if(item.image && (isNew||changedPhoto) && recognitionReady)void analyze(item);
    }
  }
  function removeItem(item) {
    if(!confirm(`Delete ${item.name}? Its photo and any saved outfits containing it will be removed from this browser.`))return;
    if(save(s=>deleteGarment(s,item.id))) {
      if(item.recognition?.jobId)api(`jobs/${item.recognition.jobId}`,null,'DELETE').catch(()=>{});
      closeEditor();notify('Garment, photo and dependent saved outfits deleted.');
    }
  }
  function clearStudio() {
    styleController.current?.abort();
    previewController.current?.abort();
    styleRun.current++;retrievalRun.current++;setStyling(false);setPreviewing(false);setStyleStage('');setOptions([]);setRetrieval(null);setRetrievalError('');setStyleMessage('');
  }
  function styleBody(nextContext=context, forQuest=questMode, activeQuest=questId) {
    return {allowPartial:true,wardrobeId:stateRef.current.wardrobeId,preferences:stateRef.current.preferences,recommendationHistory:(stateRef.current.recommendationHistory||[]).slice(-30).map(({feedback,chosenItemIds})=>({feedback,chosenItemIds})),items:stateRef.current.items.map(({image,originalImage,cutoutImage,recognition,...item})=>item),provider:engine==='agent'?'auto':engine,context:nextContext,request:request.trim()||'Create a balanced outfit for my plans.',anchorId:anchorId||undefined,requireLowUse:forQuest&&activeQuest==='rediscover'};
  }
  async function previewMatches() {
    previewController.current?.abort();const controller=new AbortController();previewController.current=controller;
    const run=++retrievalRun.current;setPreviewing(true);setRetrievalError('');
    try {const result=await api('retrieve',styleBody(),'POST',{signal:controller.signal,timeoutMs:45000});if(run===retrievalRun.current)setRetrieval(result.retrieval);}
    catch(error){if(run===retrievalRun.current){setRetrieval(null);setRetrievalError(error.message);}}
    finally{if(run===retrievalRun.current)setPreviewing(false);}
  }
  async function generate(nextContext=context, forQuest=questMode, activeQuest=questId) {
    previewController.current?.abort();
    styleController.current?.abort();const controller=new AbortController();styleController.current=controller;
    const run=++styleRun.current; retrievalRun.current++;setPreviewing(false);setStyling(true);setOptions([]);setSelected(0);setStyleMessage('');setRetrievalError('');
    const items=stateRef.current.items.filter(i=>!i.needsReview);
    try {
      let choices,reason;
      if(engine!=='baseline') {
        const body=styleBody(nextContext,forQuest,activeQuest);setStyleStage('generating');
        const result=await api('style',body,'POST',{signal:controller.signal,timeoutMs:65000});
        if(run!==styleRun.current)return;setRetrieval(result.retrieval);
        save(s=>({...s,recommendationHistory:[...(s.recommendationHistory||[]),{runId:result.pipeline.runId,createdAt:new Date().toISOString(),context:nextContext,provider:result.pipeline.provider,model:result.model,latencyMs:result.pipeline.timingMs.total,fallback:result.pipeline.fallback,knowledgeMode:result.retrieval.knowledge?.metadata?.mode,sourceIds:result.retrieval.promptSourceIds||[],outfits:result.data.outfits.map(({itemIds,title})=>({itemIds,title})),chosenItemIds:result.data.outfits[0]?.itemIds||[],status:result.data.outfits.length?'ready':'abstained'}].slice(-100)}));
        choices=result.data.outfits.map(o=>({...o,engine:'agent',provider:result.pipeline?.provider,pipeline:result.pipeline,model:result.model,wearId:crypto.randomUUID()}));reason=result.pipeline?.fallback?.message||result.data.reason;
      }else {
        const result=rankOutfits(items,nextContext,{requireLowUse:forQuest&&activeQuest==='rediscover'});
        choices=result.outfits.map((o,index)=>({itemIds:o.items.map(i=>i.id),title:`${nextContext} · ${index+1}`,explanation:o.explanation,engine:'baseline',wearId:crypto.randomUUID()}));reason=result.reason;
      }
      if(run!==styleRun.current)return;
      setOptions(choices);setStyleMessage(reason);setLookName(choices[0]?.title||'');
    }catch(error){if(run===styleRun.current)setStyleMessage(error.message);}
    finally{if(run===styleRun.current){setStyling(false);setStyleStage('');}}
  }
  function startQuest(q) {
    if(styling){notify('Let the current styling request finish first.');return;}
    setQuestId(q.id);setContext(q.context);setQuestMode(true);setPage('Outfits');
    void generate(q.context,true,q.id);
  }
  function cancelStyling() {
    retrievalRun.current++;previewController.current?.abort();setPreviewing(false);
    styleRun.current++;styleController.current?.abort();setStyling(false);setStyleStage('');setStyleMessage('Request stopped. Your matches are here when you want to try again.');
  }
  const selectedOption=options[selected], outfit=selectedOption?.itemIds.map(id=>state.items.find(i=>i.id===id)).filter(Boolean)||[];
  const lowUse=state.items.filter(i=>i.wears<=1), needsReview=state.items.filter(i=>i.recognition?.status==='review'||i.needsReview), processing=state.items.filter(i=>pending(i.recognition));
  useEffect(() => { if(filter==='Review'&&!needsReview.length)setFilter('All'); },[filter,needsReview.length]);
  const selectedQuest=quests.find(q=>q.id===questId);
  const visible=state.items.filter(i=>(filter==='All'||filter==='Rediscover'&&i.wears<=1||filter==='Review'&&(i.needsReview||i.recognition?.status==='review')||filter===i.category)&&`${i.name} ${i.tags} ${i.colorName||''} ${i.category}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='wears'?a.wears-b.wears:sort==='name'?a.name.localeCompare(b.name):(b.addedAt||'').localeCompare(a.addedAt||''));
  const editorStored=editor&&state.items.find(i=>i.id===editor.id);
  useEffect(() => {
    if(editorStored?.recognition?.status==='review'&&!(editorStored.recognition.result?.garments?.length>1))setEditor(current=>prefillReview(current,editorStored,recognitionPatch(editorStored.recognition.result)));
  },[editor?.id,editorStored?.recognition?.result]);
  const editorHasChanges=editorStored&&['name','category','color','colorName','tags','pattern','fit','materialAppearance','visibleLabelText','image','cutoutImage','displayMode'].some(key=>editor[key]!==editorStored[key]);
  const editorRecognition=editor?.appliedSuggestions?editor.recognition:editorStored?.photoKey===editor?.photoKey?editorStored?.recognition:editor?.recognition;
  const editorDetections=editorRecognition?.status==='review'&&editorRecognition.result?.garments?.length>1&&!editorRecognition.importedDetections;
  function trackRecommendation(look,patch) {
    const runId=look.pipeline?.runId||look.runId;if(!runId)return;
    save(s=>({...s,recommendationHistory:(s.recommendationHistory||[]).map(run=>run.runId===runId?{...run,...patch,chosenItemIds:look.itemIds}:run)}));
  }
  function wear(ids,id,outfitId=null) {if(save(s=>recordWear(s,ids,{id,outfitId})))notify('Wear recorded in your journal.');}
  function openListing(item) {setResale({id:item.id,text:item.resaleDraft||listing(item)});}
  async function recordStyleFeedback(value) {
    if(!value||!selectedOption)return;
    const snapshot=selectedOption;
    const candidates=(retrieval?retrieval.items.map(match=>stateRef.current.items.find(i=>i.id===match.id)):outfit).filter(Boolean);
    const fields=['id','category','colorName','fit','itemType','wears'];
    try{await learningEvent({type:'outfit_feedback',source:candidates.some(i=>i.sampleId)?'sample':'user',context,feedback:value,candidates:candidates.map(item=>Object.fromEntries(fields.filter(key=>item[key]!==undefined).map(key=>[key,item[key]]))),selectedItemIds:snapshot.itemIds});setFeedback(current=>({...current,[snapshot.wearId]:value}));notify('Style feedback saved locally.');}catch(error){notify(error.message);}
  }
  function styleThisPiece(item) {clearStudio();setEngine(preferences.recommendationProvider==='auto'?'agent':preferences.recommendationProvider);setAnchorId(item.id);setQuestMode(false);closeEditor();setPage('Outfits');}
  async function exportListing() {
    const item=stateRef.current.items.find(i=>i.id===resale.id);
    try {downloadJson({title:item.name,description:resale.text,category:item.category,image:item.image?await imageData(item.image):null,photoCredit:photoSources.find(s=>s.id===item.sampleId)||null,imageNote:item.sampleId?'Sample photograph. Replace with a photo of the actual item before selling.':(item.backgroundCleaned?'User-reviewed plain-background cleanup; original retained on device.':'Original-background resized photo.')},'closet-quest-listing.json');notify('Listing and photo exported.');}catch(error){notify(error.message);}
  }

  return <div className="app">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();setPage('Closet');}}><span className="brand-icon">cq</span><span>closet quest<span className="brand-sub">LESS NEW. MORE YOU.</span></span></a>
      <button className="phone-account" aria-label="Open account and settings" onClick={()=>setModal('profile')}>{(state.profile||'Y')[0].toUpperCase()}<span aria-hidden="true"/></button>
      <div className="nav-label">YOUR LITTLE STYLE WORLD</div>
      <FluidNavigation page={page} onNavigate={name=>{setPage(name);setMoreOpen(false);}} moreOpen={moreOpen} onMore={setMoreOpen} moreTrigger={moreTrigger} closeMore={closeMore} onModal={setModal}/>
      <button className="profile" onClick={()=>setModal('profile')}><span className="avatar">{(state.profile||'Y')[0].toUpperCase()}</span><span>{state.profile||'Your closet'}<small>{account?.cloud?'Your account · settings':'On this device · settings'}</small></span></button>
    </aside>
    <main>
      {account?.cloud?<div className={`cloud-status ${syncStatus.phase}`} role="status"><span><i/>{syncStatus.phase==='saved'?'Your closet, in sync':syncStatus.phase==='saving'?'Saving your changes…':syncStatus.phase==='pending'?'Changes saved on this device':syncStatus.phase==='conflict'?'Your closet changed on another device':syncStatus.message}</span>{['error','conflict'].includes(syncStatus.phase)&&<><button onClick={()=>downloadJson(stateRef.current,'closet-unsynced-backup.json')}>Export backup</button>{syncStatus.phase==='error'?<button onClick={()=>void sync.current.retry().catch(()=>{})}>Retry sync</button>:<button onClick={()=>location.reload()}>Review versions</button>}</>}</div>:account&&<div className="demo-banner">Private pilot · saved in this browser<button onClick={signOut}>Sign out</button></div>}
      {ALPHA&&<div className="demo-banner">Sprint 6 rehearsal · sample photographs and wear counts · separate from your personal closet.<a href="/">My closet</a><button onClick={()=>setModal('reset-alpha')}>Reset rehearsal</button></div>}
      {ROLEPLAY&&<div className="demo-banner">Role-play wardrobe · sample photos and simulated wear dates. Your personal closet is separate.<a href="/">Return to my closet</a></div>}
      <header><span>YOUR WARDROBE, REIMAGINED</span><div className="level">✦ Level {Math.floor(state.xp/100)+1}<b>{state.xp} XP</b></div></header>
      <div className={`page-scene page-${page.toLowerCase()}`} data-returning={returningPage} key={page}>
      <div className="page-heading"><div><p className="eyebrow">MAKE MORE OF WHAT YOU OWN</p><h1>{{Validation:'Make it meaningful.',Memory:'Your style, remembered.',Closet:'Your closet.',Outfits:'Your personal stylist.',Lookbook:'Saved looks.',Quests:'A little challenge. A fresh look.',Resale:'Ready for a second chapter.',Inspiration:'A look you love. Made yours.',Lab:'Evidence behind the experience.'}[page]}</h1><p>{{Validation:'Real wardrobes. Clear comparisons. Measured outcomes.',Memory:'Choose what you like. Keep useful references. See what worked.',Closet:'Everything you own. More ways to wear it.',Outfits:'Tell us about your day. We’ll start with your closet.',Lookbook:'Good combinations, ready to wear again.',Quests:'Rediscover your wardrobe, one quest at a time.',Resale:'Give the pieces you reach for less a new beginning.',Inspiration:'Recreate the feeling with pieces you already own.',Lab:'Inspect the baseline and the working prototype.'}[page]}</p></div>{page==='Closet'&&<div className="heading-actions"><button className="primary" aria-label="Add clothes" disabled={busy} onClick={()=>setModal('add')}>＋ Add clothes</button></div>}</div>
      <input ref={uploadInput} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Import garment photos" onChange={e=>{if(e.target.files.length){setModal(null);setPage('Closet');void batchUpload(e.target.files);}}}/>
      {page==='Validation'&&<ValidationStudy state={state} save={save} account={account}/>}

      {page==='Closet'&&<>
        <ClosetHero items={state.items} reviewCount={needsReview.length} onStyle={()=>setPage('Outfits')}/>
        <section className="stats"><div><strong>{state.items.length}</strong><span>pieces in your closet</span></div><div><strong>{state.savedOutfits.length}</strong><span>looks worth repeating</span></div><div><strong>{lowUse.length}</strong><span>waiting to be rediscovered</span></div></section>
        {(processing.length>0||needsReview.length>0||busy)&&<div className="processing-strip" role="status"><span className={processing.length||busy?'pulse-dot':'status-dot'}/><span>{busy?'Preparing your photos…':`${processing.length?`${processing.length} photo${processing.length===1?'':'s'} analyzing · `:''}${needsReview.length} piece${needsReview.length===1?'':'s'} to review`}</span>{needsReview.length>0&&<button className="text-button" onClick={reviewImports}>Review pieces →</button>}</div>}
        {!account?.cloud&&!state.items.some(i=>i.sampleId)&&<div className="collection-banner"><div><strong>Meet the real-photo collection.</strong><p>Seven photographed pieces to explore alongside your existing closet.</p></div><button onClick={()=>{if(save(addPhotoCollection))notify('Seven sample pieces added. Your existing closet is preserved.');}}>Add photo collection ↗</button></div>}
        <div className="section-heading wardrobe-heading"><h2>Your pieces <small>{visible.length}</small></h2><div className="wardrobe-tools"><label className="search"><span aria-hidden="true">⌕</span><input aria-label="Search wardrobe" placeholder="Search your clothes" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filter wardrobe" value={filter} onChange={e=>setFilter(e.target.value)}>{['All',...categories,'Rediscover',...(needsReview.length?['Review']:[])].map(c=><option key={c} value={c}>{c==='All'?'All pieces':c}</option>)}</select><select aria-label="Sort wardrobe" value={sort} onChange={e=>setSort(e.target.value)}><option value="added">Newest first</option><option value="wears">Least worn</option><option value="name">Name A–Z</option></select></div></div>
        <div className="phone-categories" aria-label="Clothing categories" ref={element=>{if(element)element.scrollLeft=categoryScroll.current;}} onScroll={e=>{categoryScroll.current=e.currentTarget.scrollLeft;}}>{['All',...categories,'Rediscover',...(needsReview.length?['Review']:[])].map(c=><button key={c} aria-pressed={filter===c} onClick={()=>setFilter(c)}>{c==='All'?'All pieces':c}</button>)}</div>
        <div className="wardrobe-with-looks"><div className="wardrobe-piece-area"><div className="grid wardrobe-grid">{visible.map(item=><GarmentCard key={item.id} item={item} onClick={()=>setEditor({...item})}/>)}</div>
        {!visible.length&&<div className="empty closet-empty"><span aria-hidden="true">＋</span><h2>{state.items.length?'No pieces here yet.':'Your next favorite look starts here.'}</h2><p>{state.items.length?'Try another search or filter.':'Add a top, a bottom and shoes. One outfit photo can capture all three.'}</p>{state.items.length?<button onClick={()=>{setSearch('');setFilter('All');}}>Clear filters</button>:<button className="primary" onClick={()=>setModal('add')}>Add my first pieces</button>}</div>}
        </div><WardrobeRail state={state} scrollPosition={savedRailScroll} onStyle={()=>setPage('Outfits')} onEdit={item=>setEditor({...item})} onWear={look=>{if(save(s=>recordWearToday(s,look.itemIds,{outfitId:look.id,runId:look.runId})))notify('Wear recorded in your journal.');}}/></div>
        {state.items.some(i=>i.sampleId)&&<p className="collection-note">Sample photographs and demonstration wear counts. Photo credits are under More.</p>}
      </>}

      {page==='Memory'&&<StyleMemory state={state} onSave={save} ai={ai} notify={notify}/>}
      {page==='Outfits'&&<OutfitStudio
        view={studioView} onViewChange={setStudioView} scrollPosition={outfitScroll}
        items={state.items} context={context} onContext={value=>{clearStudio();setContext(value);setQuestMode(false);}}
        request={request} onRequest={value=>{clearStudio();setRequest(value);}}
        engine={engine} onEngine={value=>{clearStudio();setEngine(value);if(value==='baseline')setAnchorId('');}}
        anchorId={anchorId} onAnchor={value=>{clearStudio();setAnchorId(value);}}
        aiReady={ai.stylistReady} openaiConfigured={ai.openai?.configured} styling={styling} styleStage={styleStage} previewing={previewing}
        retrieval={retrieval} retrievalError={retrievalError} onPreview={previewMatches} onGenerate={()=>generate()}
        onCancel={cancelStyling}
        processingCount={processing.length} quest={questMode?selectedQuest:null}
        options={options} selected={selected} onSelect={index=>{setSelected(index);setLookName(options[index].title);trackRecommendation(options[index],{chosenItemIds:options[index].itemIds});}}
        message={styleMessage} allowResultFocus={!editor&&!modal&&!resale} onEdit={item=>setEditor({...item})}>
        {selectedOption&&outfit.length>0&&<section className="panel studio-save">
          <div className="toolbar"><button className="primary" onClick={()=>{if(save(s=>saveLook(s,selectedOption.itemIds,{...selectedOption,title:lookName,context:selectedOption.occasion||context}))){trackRecommendation(selectedOption,{savedAt:new Date().toISOString()});notify('Saved to your looks.');}}}>{selectedOption.lookType==='starting-point'?'Save this starting point':'Save this look'}</button><button className="text-button" disabled={wornToday(state,selectedOption.itemIds)} onClick={()=>{if(save(s=>recordWearToday(s,selectedOption.itemIds,{runId:selectedOption.pipeline?.runId}))){notify('Wear recorded in your journal.');}}}>{wornToday(state,selectedOption.itemIds)?'✓ Wear recorded':'Wear today'}</button><details className="look-name-details"><summary>Rename</summary><label>Name this look<input maxLength="80" value={lookName} onChange={e=>setLookName(e.target.value)}/></label></details></div>
          <details open={questMode||undefined}><summary>Make this look a style quest</summary><div className="quest-submit"><label>Style quest<select value={questId} onChange={e=>setQuestId(e.target.value)}>{quests.map(q=><option key={q.id} value={q.id}>{q.title} · {q.xp} XP</option>)}</select></label><button disabled={state.completed.includes(questId)||selectedOption.lookType==='starting-point'} onClick={()=>{if(save(s=>completeQuest(s,selectedQuest,outfit,context,{stylistSuggested:selectedOption.engine==='agent'})))notify(`Quest complete! +${selectedQuest.xp} XP`);}}>{state.completed.includes(questId)?'✓ Quest completed':'Submit outfit + earn XP'}</button></div><p className="muted">{selectedQuest.subtitle} · {selectedQuest.context}. Submit before recording a wear if your hidden gem already has one wear.</p></details>
          {selectedOption.pipeline&&<div className="toolbar"><span>Would you wear this?</span><button onClick={()=>{trackRecommendation(selectedOption,{feedback:'helpful',feedbackAt:new Date().toISOString()});notify('Preference saved. Future suggestions will consider these pieces.');}}>Yes, my style</button><button onClick={()=>{trackRecommendation(selectedOption,{feedback:'not-for-me',feedbackAt:new Date().toISOString()});notify('Feedback saved. These pieces will get less emphasis.');}}>Not for me</button></div>}
          {state.learningEnabled!==false&&<details className="style-feedback"><summary>Style feedback</summary><label>Would you wear this?<select value={feedback[selectedOption.wearId]||''} onChange={e=>recordStyleFeedback(e.target.value)}><option value="">Choose your feedback</option><option value="like">Yes, this feels like me</option><option value="dislike">Not my style</option></select></label><p className="muted">Stored locally to evaluate and improve future recommendations. This does not retrain a model immediately.</p></details>}
        </section>}
      </OutfitStudio>}

      {page==='Lookbook'&&<>
        <div className="lookbook-grid">{state.savedOutfits.map(look=><section className="saved-look" key={look.id}><div className="look-collage">{look.itemIds.map(id=>state.items.find(i=>i.id===id)).filter(Boolean).map(item=><Garment key={item.id} item={item}/>)}</div><div className="saved-look-content"><p className="eyebrow">{look.context}</p><h2>{look.title}</h2><p>{look.explanation}</p><div className="toolbar"><button className="primary" disabled={wornToday(state,look.itemIds)} onClick={()=>{if(save(s=>recordWearToday(s,look.itemIds,{outfitId:look.id,runId:look.runId}))){notify('Wear recorded in your journal.');}}}>{wornToday(state,look.itemIds)?'✓ Worn today':'Wear today'}</button><button className="text-button" onClick={()=>{save(s=>({...s,savedOutfits:s.savedOutfits.filter(o=>o.id!==look.id)}));}}>Remove saved look</button></div></div></section>)}</div>
        {!state.savedOutfits.length&&<div className="empty"><span className="empty-symbol">♡</span><h2>Keep a good combination close.</h2><p>Save a suggestion from the styling studio to start your lookbook.</p><button className="primary" onClick={()=>setPage('Outfits')}>Find an outfit ↗</button></div>}
        <div className="section-heading"><div><h2>Your wear journal</h2><p>A small record of the pieces you reach for.</p></div>{state.wearRecords.length>0&&<button onClick={()=>{if(save(undoLastWear))notify('Latest wear undone. Counts restored.');}}>Undo latest wear</button>}</div>
        {state.wearRecords.length?<div className="wear-journal">{[...state.wearRecords].reverse().map(record=><div className="wear-entry" key={record.id}><time dateTime={record.wornAt}>{dateLabel(record.wornAt)}</time><div className="wear-thumbnails">{record.itemIds.map(id=>state.items.find(i=>i.id===id)).filter(Boolean).map(item=><Garment key={item.id} item={item}/>)}</div><span>{record.itemIds.map(id=>state.items.find(i=>i.id===id)?.name).filter(Boolean).join(' + ')}</span></div>)}</div>:<p className="muted">Wear a piece or an outfit to start your journal. Existing demo counts are kept separately.</p>}
      </>}
      {page==='Quests'&&<><FavoriteQuest state={state} save={save} onStyle={styleThisPiece}/><section className="progress-panel"><div><p className="eyebrow">YOUR STYLE JOURNEY</p><h2>Level {Math.floor(state.xp/100)+1} · Closet explorer</h2><p>{state.xp} total XP · {100-state.xp%100} XP to the next level</p></div><progress max="100" value={state.xp%100} aria-label="Progress to next level"/></section><div className="quest-grid">{quests.map((q,index)=><section className="quest-card" key={q.id}><div className="quest-top"><span>0{index+1} / STYLE QUEST</span><b>+{q.xp} XP</b></div><div className="quest-symbol">{['✧','☕','↗'][index]}</div><h2>{q.title}</h2><p>{q.subtitle}</p><small>{q.context}</small><button className="primary" disabled={state.completed.includes(q.id)} onClick={()=>startQuest(q)}>{state.completed.includes(q.id)?'✓ Completed':'Start quest ↗'}</button></section>)}</div></>}
      {page==='Inspiration'&&<Inspiration state={state} save={save} ready={ai.localRecognitionReady??ai.recognitionReady} onStyle={(brief,anchor)=>{clearStudio();setRequest(brief);setEngine('quick');setAnchorId(anchor?.id||'');setQuestMode(false);setPage('Outfits');}}/>}
      {page==='Resale'&&<><ClosetCheck state={state} save={save} onStyle={styleThisPiece} onListing={openListing}/><DepopConnection status={ai.depop}/><div className="notice">↻ {lowUse.length} pieces have one recorded wear or less. Try them in a new outfit, or prepare a listing for their next chapter.</div><div className="grid">{lowUse.map(item=><GarmentCard key={item.id} item={item}><button onClick={()=>openListing(item)}>Prepare listing ↗</button></GarmentCard>)}</div>{!lowUse.length&&<div className="empty">Every piece is in rotation. You can prepare a listing from any garment’s details.</div>}</>}
      {page==='Lab'&&<><MLStatus status={ai}/><RagEvidence/><PhotoEvidence/><Feasibility/></>}
      </div>
      <footer><span>less new. more you.</span><p>{account?.cloud?'Your private wardrobe':'Saved in this browser'}</p></footer>
    </main>
    {toast&&<div className="toast" role="status">{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}>×</button></div>}

    {editor&&<Modal key={editor.id} title={editor.isNew?'Add a piece':reviewQueue?'Review your clothes':'Your piece'} onClose={closeEditor} wide>
      <form onSubmit={saveEditor} className="garment-editor"><div className="editor-photo-column"><div className="editor-photo"><Garment item={editor} loading="eager"/></div><details className="photo-details" open={editor.isNew||undefined}><summary>{editor.image?'Change photo & credits':'Add a photo'}</summary><label className="file-label">{busy?'Preparing photo…':'Choose a photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>upload(e.target.files[0])}/></label><p className="muted">JPG, PNG or WebP · up to 8 MB. {account?.cloud?'Saved privately in your account.':'Saved on this device.'}</p><PhotoCredit item={editor}/></details>{editor.image&&<GarmentDisplay key={`${editor.id}-${editor.photoKey}`} item={editor} onChange={setEditor}/>}{!editor.isNew&&<p className="wear-detail"><strong>{editorStored?.wears||0}</strong> recorded wears{editorStored?.lastWorn&&<small>Last worn {dateLabel(editorStored.lastWorn)}</small>}</p>}{!editor.isNew&&!reviewQueue&&<><button type="button" className="style-piece-button" disabled={busy||editorStored?.needsReview||editorHasChanges} onClick={()=>styleThisPiece(editorStored)}>Style this piece ↗</button>{(editorHasChanges||editorStored?.needsReview)&&<p className="muted">Save your details first to style this piece.</p>}</>}</div>
      <div className="editor-fields">{reviewQueue&&<p className="review-progress">PHOTO → REVIEW → READY TO STYLE · {needsReview.length} left</p>}
        {pending(editorRecognition)&&<div className="analysis-panel" role="status"><span className="pulse-dot"/><strong>{{preparing:'Preparing your photo…',recognizing:'Finding clothing and accessories…',validating:'Checking the suggestions…',retrying:'Retrying photo analysis…'}[editorRecognition.stage]||'Photo queued for analysis'}</strong><p>{editorRecognition.error||'You can keep editing or close this panel. Suggestions will be waiting here.'}</p><button type="button" onClick={()=>cancelAnalysis(editor,editorRecognition)} disabled={!editorRecognition.jobId}>Cancel analysis</button></div>}
        {editorRecognition?.status==='review'&&!editor.appliedSuggestions&&!editorDetections&&<div className="analysis-panel"><strong>✧ Suggestions are ready to review</strong><p>{editorRecognition.result.data.name} · {editorRecognition.result.data.category} · {editorRecognition.result.data.colorName}</p>{editorRecognition.result.data.targetDescription&&<p>Looking at: {editorRecognition.result.data.targetDescription}</p>}<p className="muted">Applying fills the fields below. Review and edit them before saving. Color swatches are approximate; label text stays manual.</p><button type="button" onClick={()=>setEditor({...editor,...recognitionPatch(editorRecognition.result),recognition:editorRecognition,appliedSuggestions:true})}>Apply suggestions to form</button></div>}
        {editor.appliedSuggestions&&<div className="analysis-panel"><strong>Review the suggested details below.</strong><p>{editorRecognition?.result?.model||'Model suggestions'}{editorRecognition?.result?.pipeline?.cache?.hit?' · cached result':''}</p><p>Your changes take effect when you save.</p></div>}
        {editorRecognition?.status==='failed'&&<div className="analysis-panel error" role="status"><strong>Photo saved. Analysis needs another try.</strong><p>{editorRecognition.error}</p></div>}
        {editorRecognition?.status==='cancelled'&&<div className="analysis-panel" role="status"><strong>Analysis cancelled.</strong><p>Your photo and saved details are still here. You can analyze it again when ready.</p></div>}
        {editorDetections&&<PhotoDetections key={editorRecognition.jobId} source={editorStored} result={editorRecognition.result} busy={busy} onReview={reviewDetectedPieces}/>}
        {!editorDetections&&<>
        <label>Garment name<input required maxLength="80" value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></label>
        <div className="form-row"><label>Category<select value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Color<input type="color" value={editor.color} onChange={e=>setEditor({...editor,color:e.target.value})}/></label></div>
        <details className="attribute-details" open={editor.appliedSuggestions||undefined}><summary>Style & garment details</summary><label>Style & occasions<input maxLength="500" value={editor.tags} onChange={e=>setEditor({...editor,tags:e.target.value})}/></label>{['colorName','pattern','fit','materialAppearance','visibleLabelText'].map(field=><label key={field}>{{colorName:'Color description',pattern:'Pattern',fit:'Apparent fit',materialAppearance:'Material appearance (unverified)',visibleLabelText:'Visible label text (unverified)'}[field]}<input maxLength="500" value={editor[field]||''} onChange={e=>setEditor({...editor,[field]:e.target.value})}/></label>)}</details>
        {editor.uncertainty?.length>0&&<p className="muted">Review notes: {editor.uncertainty.join(' ')}</p>}
        {editor.isNew&&<p className="muted">{!editor.image?'Save the details now. You can add and analyze a photo later.':recognitionReady?'Save your piece to start photo analysis in the background.':'Save your photo and label it manually. You can analyze it later when local AI is connected.'}</p>}
        <div className="toolbar garment-save"><button className="primary" disabled={busy} type="submit">{reviewQueue&&needsReview.some(i=>i.id!==editor.id)?'Save & review next':'Save piece'}</button>{reviewQueue&&<span className="muted">{needsReview.length} left to review</span>}</div>
        </>}
        {!editor.isNew&&<details className="garment-more-actions" open={editorRecognition?.status==='failed'||editorRecognition?.status==='cancelled'||undefined}><summary>More actions</summary><div className="toolbar"><button type="button" disabled={!recognitionReady||!editor.image||pending(editorRecognition)||editor.appliedSuggestions||busy||editorStored?.photoKey!==editor.photoKey} onClick={()=>analyze(editorStored)}>{editorRecognition?.status==='failed'?'Retry photo analysis':'Analyze photo again'}</button><button type="button" disabled={!recognitionReady||!editor.image||pending(editorRecognition)||busy||editorHasChanges} onClick={()=>analyze(editorStored,'multiple')}>Find all pieces in this photo</button><button type="button" onClick={()=>wear([editor.id],crypto.randomUUID())}>Record a wear</button><button type="button" onClick={()=>{openListing(editorStored);closeEditor();}}>Prepare resale draft</button><button type="button" className="danger text-button" onClick={()=>removeItem(editorStored)}>Delete piece</button></div></details>}
      </div></form>
    </Modal>}
    {modal==='add'&&<Modal title="Add to your closet" onClose={()=>setModal(null)}><div className="add-clothes-flow"><div className="add-clothes-symbol" aria-hidden="true">＋</div><h3>A photo. A few details. Yours.</h3><p>Upload an outfit photo or choose up to eight photos at once. We’ll find the clothing and accessories, then you choose which pieces to keep.</p><div className="flow-steps" aria-label="Import steps"><span><b>1</b> Add photo</span><span><b>2</b> Review</span><span><b>3</b> Style it</span></div><div className="add-photo-actions"><button className="primary" disabled={busy} onClick={()=>setModal('camera')}>Take a photo</button><button disabled={busy} onClick={()=>uploadInput.current.click()}>Choose photos</button></div><p className="muted">JPG, PNG or WebP · up to 8 MB each<br/>{preferences.recognitionProvider==='openai'?'OpenAI photo analysis sends the image to OpenAI.':'Local photo analysis stays on this device.'}</p><button className="text-button" onClick={newGarment}>Add without a photo</button></div></Modal>}
    {modal==='camera'&&<Modal title="Photograph your outfit or pieces" onClose={()=>setModal(null)}><CameraCapture onUse={file=>{setModal(null);setPage('Closet');void batchUpload([file]);}} onChoose={()=>uploadInput.current.click()}/></Modal>}
    {resale&&<Modal title="A new-home starter kit." onClose={()=>setResale(null)}><div className="listing-piece"><Garment item={state.items.find(i=>i.id===resale.id)}/><div><p className="eyebrow">YOUR RESALE DRAFT</p><h3>{state.items.find(i=>i.id===resale.id)?.name}</h3><p>Edit your draft, then copy the text or export the package with its photo.</p></div></div>{state.items.find(i=>i.id===resale.id)?.sampleId&&<div className="notice">This is a sample garment. Use your own photo of the actual item before posting a listing.</div>}<label>Listing draft<textarea rows="6" value={resale.text} onChange={e=>setResale({...resale,text:e.target.value})}/></label><div className="toolbar"><button className="primary" onClick={async()=>{try{await navigator.clipboard.writeText(resale.text);notify('Listing copied.');}catch{notify('Select the text and copy it manually.');}}}>Copy listing</button><button onClick={()=>{if(save(s=>({...s,items:s.items.map(i=>i.id===resale.id?{...i,resaleDraft:resale.text}:i)})))notify('Resale draft saved on this device.');}}>Save draft</button><button onClick={exportListing}>Export with photo ↓</button></div><p className="muted">Check brand, size, condition and price before posting. Nothing is automatically published.</p></Modal>}
    {modal==='credits'&&<Modal title="The real-photo collection." onClose={()=>setModal(null)} wide><p>Seven real photographs from Wikimedia Commons. Each photo keeps its original license. Sample tags and wear counts are for exploring the app.</p><Credits/></Modal>}
    {modal==='reset-alpha'&&<Modal title="Reset this rehearsal?" onClose={()=>setModal(null)}><p>This replaces only the Sprint 6 sample wardrobe, saved looks, XP and history. Your personal closet and role-play wardrobe stay separate.</p><button className="primary" onClick={()=>{const old=stateRef.current.items;if(save(alphaDemoState())){for(const item of old)if(pending(item.recognition)&&item.recognition.jobId)void api(`jobs/${item.recognition.jobId}`,null,'DELETE').catch(()=>{});clearStudio();closeEditor();setModal(null);setPage('Closet');setSearch('');setFilter('All');setAnchorId('');setQuestMode(false);notify('Rehearsal reset. Upload public/photos/tee.jpg to begin.');}}}>Reset sample wardrobe</button></Modal>}
    {modal==='import-backup'&&backupImport&&<Modal title="Bring this wardrobe with you?" onClose={()=>{setBackupImport(null);setModal('profile');}}><p>This backup contains {backupImport.items.length} pieces and {backupImport.savedOutfits.length} saved looks. Importing replaces the wardrobe currently in this account.</p><div className="toolbar"><button onClick={exportBackup}>Back up my current wardrobe</button><button className="primary" onClick={()=>{if(save({...backupImport,wardrobeId:account.id,onboardingComplete:true,learningEnabled:false})){setBackupImport(null);setModal(null);clearStudio();notify('Wardrobe imported. Syncing to your account.');}}}>Import this wardrobe</button></div></Modal>}
    {modal==='profile'&&<Modal title="Your little style world." onClose={()=>setModal(null)}><form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);if(save(s=>({...s,profile:data.get('name').trim()})))setModal(null);}}><label>Display name<input name="name" maxLength="40" defaultValue={state.profile} placeholder="Your name"/></label><div className="toolbar"><button className="primary">Save name</button><button type="button" onClick={exportBackup}>Export closet backup ↓</button></div></form><p className="muted">{account?.cloud?'Your wardrobe, saved looks and preferences sync privately to your account. Changes are saved on this device while reconnecting.':'This pilot keeps your wardrobe in this browser.'} Photo analysis sends images to the selected AI provider. Styling sends reviewed descriptions, preferences and relevant notes, without photos or your display name.</p>{account?.cloud&&<><p className="account-email">{account.email}</p><button onClick={signOut}>Sign out</button><label className="backup-import">Import a wardrobe backup<input type="file" accept="application/json,.json" onChange={readBackup}/></label></>}<label className="checkbox-label"><input type="checkbox" disabled={Boolean(account?.cloud)} checked={state.learningEnabled!==false} onChange={e=>save(s=>({...s,learningEnabled:e.target.checked}))}/>Keep reviewed corrections and explicit style feedback for local learning</label><p className="muted">Learning records exclude photos, garment names, labels and your profile. Disabling stops new records. Sample pieces are tracked separately from personal training data.</p><button onClick={()=>{if(save(addPhotoCollection))notify('All missing sample pieces added.');}}>Add missing sample pieces</button></Modal>}
    {account?.cloud&&state.onboardingComplete===false&&<WelcomeFlow onFinish={({name,styles,samples})=>{const next={...stateRef.current,profile:name.trim(),onboardingComplete:true,preferences:{...preferences,styles},learningEnabled:false};if(save(samples?addPhotoCollection(next):next)&&!samples)setModal('add');}}/>}
  </div>;
}
