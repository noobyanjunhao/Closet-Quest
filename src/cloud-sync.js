// A single writer per tab; compare-and-swap protects other devices.
export function createSyncQueue({revision=0,prepare=async x=>x,write,persist,onStatus=()=>{},onCommitted=()=>{}}) {
 let latest=null,running=null,blocked=null,closed=false;
 async function flush(){
  if(running)return running;
  if(blocked)throw blocked;
  running=(async()=>{
   while(latest&&!closed){const snapshot=latest;onStatus({phase:'saving'});
    try{const prepared=await prepare(snapshot),result=await write(prepared,revision);revision=result.revision;
     if(latest===snapshot){latest=null;persist(null);onCommitted(prepared);onStatus({phase:'saved'});}else persist({state:latest,revision});
    }catch(error){blocked=error;persist({state:latest,revision});onStatus({phase:error.status===409?'conflict':'error',message:error.message});throw error;}
   }
  })().finally(()=>{running=null;});return running;
 }
 return {enqueue(state){if(closed)return;latest=state;persist({state,revision});onStatus(blocked?{phase:blocked.status===409?'conflict':'error',message:blocked.message}:{phase:'pending'});},flush,retry(){blocked=null;return flush();},adopt(nextRevision){if(latest||running||blocked)throw Error('Sync pending changes before loading an imported closet.');revision=nextRevision;persist(null);onStatus({phase:'saved'});},get pending(){return Boolean(latest);},close(){closed=true;}};
}
export async function prepareCloudSnapshot(state,upload,cache=new Map()) {
 const next=structuredClone(state);
 for(const item of next.items)for(const field of ['image','originalImage','cutoutImage'])if(item[field]?.startsWith('data:')){
  const original=item[field];
  if(!cache.has(original)){const result=await upload(original);if(cache.size>=40)cache.delete(cache.keys().next().value);cache.set(original,result.image);}
  item[field]=cache.get(original);
 }
 return next;
}
