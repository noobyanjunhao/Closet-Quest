import {randomUUID} from 'node:crypto';
import {normalizePurchaseText,validateExtraction,validateReviewed,validateKey,exactKeys,reviewedFields,toGarment,hash,fail} from './purchase-contract.js';
import {extractPurchaseItems,fixturePurchaseProvider,purchaseContext} from './purchase-provider.js';

export function createPurchaseImports({store,provider=extractPurchaseItems,mode='local',deadlineMs=120000,canStart=()=>true,now=Date.now}={}){
 if(!['local','fixture'].includes(mode))throw Error('Purchase imports support local or fixture mode only.');
 const pending=[],locks=new Map();let running=null,closed=false,timer;
 const ready=Promise.resolve(store.recover());
 const stamp=()=>new Date(now()).toISOString();
 const ownerOf=user=>user?.namespace||'local';
 const publicDraft=d=>{const {owner,createKey,commitKey,...visible}=structuredClone(d);return visible;};
 const read=async(user,id)=>{await ready;const d=await store.get(ownerOf(user),id,user);if(!d)throw fail('Import not found.','IMPORT_NOT_FOUND',404);return d;};
 const revision=(d,input,statuses)=>{if(!Number.isInteger(input.expected_revision)||input.expected_revision!==d.revision)throw fail('This review changed. Reload it before continuing.','IMPORT_REVISION_CONFLICT',409);if(!statuses.includes(d.status))throw fail('This import cannot be changed in its current state.','IMPORT_INVALID_STATE',409);};
 async function exclusive(id,fn){const prev=locks.get(id)||Promise.resolve();const task=prev.catch(()=>{}).then(fn);locks.set(id,task);try{return await task;}finally{if(locks.get(id)===task)locks.delete(id);}}
 async function save(d,event,user,extra){const expected=d.revision;d.revision++;d.updatedAt=stamp();d.audit.push({revision:d.revision,event,at:d.updatedAt});if(Buffer.byteLength(JSON.stringify(d))>190000)throw fail('This draft history is full. Use fewer items or start a new draft.','IMPORT_LIMIT_EXCEEDED',413);return store.save(d,expected,{...extra,user});}
 function schedule(){if(!closed){clearTimeout(timer);timer=setTimeout(drain,25);timer.unref?.();}}
 async function drain(){
  if(closed||running||!pending.length)return;
  if(!canStart()){timer=setTimeout(drain,250);timer.unref?.();return;}
  const job=pending.shift(),controller=new AbortController();running={...job,controller};
  try{
   const snapshot=await exclusive(job.id,async()=>{const d=await read(job.user,job.id);if(d.status!=='queued')return null;d.status='extracting';return save(d,'extracting',job.user);});
   if(!snapshot)return;
   const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(deadlineMs)]);
   // Promise race gives a visible deadline. Keep the slot until the actual worker
   // settles so an adapter ignoring abort cannot create unbounded inference.
   let timerId;
   const work=Promise.resolve().then(()=>(mode==='fixture'?fixturePurchaseProvider:provider)(snapshot.source,{signal,timeoutMs:deadlineMs}));
   const deadline=new Promise((_,reject)=>{timerId=setTimeout(()=>{controller.abort();reject(fail('Local extraction timed out. Retry with fewer lines.','IMPORT_TIMEOUT',503));},deadlineMs);});
   try{
    const result=await Promise.race([work,deadline]);
    await exclusive(job.id,async()=>{const d=await read(job.user,job.id);if(d.status!=='extracting'||d.generation!==snapshot.generation||d.revision!==snapshot.revision||d.source.hash!==snapshot.source.hash||closed)return;
     const prediction=validateExtraction(result.data,d.source);d.extraction=prediction;d.model=result.metadata;
     d.items=prediction.items.map(p=>({id:randomUUID(),prediction:p,reviewed:reviewedFields(p),selected:true,reviewedAt:null,changes:[]}));d.status='review_required';d.error=null;await save(d,'extracted',job.user);
    });
   }catch(e){await exclusive(job.id,async()=>{const d=await read(job.user,job.id);if(d.status==='extracting'&&d.generation===snapshot.generation&&!closed){d.status='failed';d.error={code:/^[A-Z_]+$/.test(e.code||'')?e.code:'EXTRACTION_FAILED',message:['MODEL_NOT_READY','IMPORT_TIMEOUT','IMPORT_CONTEXT_LIMIT','EXTRACTION_INVALID_OUTPUT','FIXTURE_ONLY'].includes(e.code)?e.message:'Local extraction failed. Retry or use the synthetic example.'};await save(d,'failed',job.user);}});}
   finally{clearTimeout(timerId);await work.catch(()=>{});}
  }catch{/* A storage fault never inserts wardrobe items. A lease/restart marks the job failed. */}
  finally{running=null;if(closed)store.close?.();else schedule();}
 }
 function capacity(){if(pending.length+(running?1:0)>=8)throw fail('Eight imports are already waiting. Try again shortly.','IMPORT_QUEUE_FULL',429);}
 return {
  get busy(){return Boolean(running||pending.length);},
  info(){return {enabled:true,provider:mode,processing:mode==='local'?'Local Ollama on the API host':'Synthetic fixtures only',queueDepth:pending.length,active:running?1:0,concurrency:1,deadlineMs,limits:{characters:12000,lines:200,rows:30,units:50},retention:'Sources remain until you remove the draft. Never used for training automatically.'};},
  async list(user){await ready;return (await store.list(ownerOf(user),user)).map(d=>({id:d.id,status:d.status,revision:d.revision,createdAt:d.createdAt,provider:d.provider}));},
  async create(user,input){
   exactKeys(input,['source_type','text','idempotency_key']);if(input.source_type!=='text')throw fail('Only pasted text is supported.','IMPORT_INVALID_INPUT');validateKey(input.idempotency_key);
   const source=normalizePurchaseText(input.text);if(mode==='local')purchaseContext(source);await ready;
   const prior=(await store.list(ownerOf(user),user)).find(d=>d.createKey===input.idempotency_key);
   if(prior){if(prior.source.hash!==source.hash||prior.provider!==mode)throw fail('This key belongs to different purchase text.','IMPORT_KEY_CONFLICT',409);return publicDraft(prior);}capacity();
   const draft=await store.create({id:randomUUID(),owner:ownerOf(user),createKey:input.idempotency_key,provider:mode,source,status:'queued',revision:0,generation:1,items:[],audit:[],createdAt:stamp(),updatedAt:stamp(),error:null},user);
   if(draft.status==='queued'&&!pending.some(j=>j.id===draft.id)&&running?.id!==draft.id){pending.push({id:draft.id,user});schedule();}return publicDraft(draft);
  },
  async get(user,id){const d=await read(user,id);if(['queued','extracting'].includes(d.status)&&now()-Date.parse(d.updatedAt)>deadlineMs+30000){d.status='failed';d.error={code:'IMPORT_INTERRUPTED',message:'The extraction lease expired. Retry this draft.'};try{return publicDraft(await save(d,'lease-expired',user));}catch{/* Another worker may have completed. */return publicDraft(await read(user,id));}}return publicDraft(d);},
  async edit(user,id,input){return exclusive(id,async()=>{exactKeys(input,['expected_revision','items']);const d=await read(user,id);revision(d,input,['review_required']);if(!Array.isArray(input.items)||input.items.length!==d.items.length||new Set(input.items.map(x=>x.id)).size!==d.items.length)throw fail('Review every proposed row.');
   for(const x of input.items){exactKeys(x,['id','reviewed','selected']);const item=d.items.find(i=>i.id===x.id);if(!item||typeof x.selected!=='boolean')throw fail('Invalid review item.');const values=validateReviewed(x.reviewed);const changes=Object.keys(values).filter(k=>values[k]!==item.reviewed[k]).map(field=>({field,previous:item.reviewed[field],value:values[field],kind:item.prediction[field]===null?'user_enrichment':'user_correction',at:stamp()}));item.changes.push(...changes);item.reviewed=values;item.selected=x.selected;item.reviewedAt=stamp();}
   if(d.audit.length>=100)throw fail('This draft reached its review limit. Create a new draft.','IMPORT_LIMIT_EXCEEDED',413);return publicDraft(await save(d,'reviewed',user));});},
  async commit(user,id,input){return exclusive(id,async()=>{
   exactKeys(input,['expected_revision','selected_item_ids','confirm_owned','idempotency_key']);validateKey(input.idempotency_key);
   if(input.confirm_owned!==true||!Array.isArray(input.selected_item_ids)||!input.selected_item_ids.length||input.selected_item_ids.length>30||input.selected_item_ids.some(x=>typeof x!=='string')||new Set(input.selected_item_ids).size!==input.selected_item_ids.length)throw fail('Select reviewed clothing and confirm you own it.','IMPORT_APPROVAL_REQUIRED');
   const requestHash=hash({id,revision:input.expected_revision,selection:[...input.selected_item_ids].sort(),owned:true});
   const prior=await store.committed(ownerOf(user),input.idempotency_key,user);if(prior){if(prior.hash!==requestHash||prior.importId!==id)throw fail('This commit key was used for another selection.','IMPORT_KEY_CONFLICT',409);return prior.result;}
   const d=await read(user,id);revision(d,input,['review_required']);
   const selected=d.items.filter(i=>i.selected);if(selected.length!==input.selected_item_ids.length||selected.some(i=>!input.selected_item_ids.includes(i.id)||!i.reviewedAt))throw fail('Save your review before confirming these pieces.','IMPORT_APPROVAL_REQUIRED');
   selected.forEach(i=>validateReviewed(i.reviewed,{allowUnknownQuantity:false}));if(selected.reduce((n,i)=>n+i.reviewed.quantity,0)>50)throw fail('Add at most 50 garment units at a time.','IMPORT_LIMIT_EXCEEDED',413);
   const garments=selected.flatMap(item=>Array.from({length:item.reviewed.quantity},(_,unit)=>toGarment(item,id,unit,randomUUID(),stamp())));
   const result={importId:id,garmentIds:garments.map(g=>g.id),garments};d.status='committed';d.commitKey=input.idempotency_key;d.commitResult=result;d.committedAt=stamp();
   try{await save(d,'committed',user,{commit:{key:input.idempotency_key,hash:requestHash,garments,result}});return result;}
   catch(e){const concurrent=await store.committed(ownerOf(user),input.idempotency_key,user);if(concurrent?.hash===requestHash&&concurrent.importId===id)return concurrent.result;throw e;}
  });},
  async cancel(user,id,input){return exclusive(id,async()=>{exactKeys(input,['expected_revision']);const d=await read(user,id);revision(d,input,['queued','extracting','review_required','failed']);d.status='cancelled';const saved=await save(d,'cancelled',user);if(running?.id===id)running.controller.abort();return publicDraft(saved);});},
  async retry(user,id,input){return exclusive(id,async()=>{exactKeys(input,['expected_revision']);const d=await read(user,id);revision(d,input,['failed']);capacity();if(running?.id===id)throw fail('The previous model call is still stopping.','IMPORT_MODEL_BUSY',429);d.generation++;d.status='queued';d.error=null;const saved=await save(d,'retry',user);pending.push({id,user});schedule();return publicDraft(saved);});},
  async remove(user,id){return exclusive(id,async()=>{await read(user,id);return store.remove(ownerOf(user),id,user);});},
  async close(){closed=true;clearTimeout(timer);running?.controller.abort();await ready;if(!running)store.close?.();},
 };
}
