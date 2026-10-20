import {createHash} from 'node:crypto';

// Refresh cloud source notes on every request. Only vector computations are
// reusable; edits/deletions must be visible across devices without a result TTL.
export function createCloudKnowledgeHydrator({cloud,getStore}) {
  const versions=new Map(),pendingByUser=new Map();
  return async function hydrate(user,{signal,indexOnRead=true}={}) {
    signal?.throwIfAborted();
    if(!cloud||!user?.cloud)return getStore();
    const previous=pendingByUser.get(user.id)||Promise.resolve();
    const pending=previous.catch(()=>{}).then(async()=>{
      signal?.throwIfAborted();
      const docs=await cloud.documents(user,{signal});
      signal?.throwIfAborted();
      const store=getStore(),existing=await store.list(user.namespace),remoteIds=new Set(docs.map(doc=>doc.id));
      for(const doc of existing)if(doc.origin==='user'&&!remoteIds.has(doc.id)){
        signal?.throwIfAborted();
        await store.remove(user.namespace,doc.id);versions.delete(`${user.id}:${doc.id}`);
      }
      let indexed=0;
      for(const doc of docs){
        signal?.throwIfAborted();
        const key=`${user.id}:${doc.id}`,version=createHash('sha256').update(JSON.stringify(doc)).digest('hex');
        const prior=versions.get(key);
        const buildVectors=indexOnRead&&indexed<2;
        if(prior?.version!==version||buildVectors&&!prior.indexed){
          const result=await store.upsert(user.namespace,doc,{signal,embeddingProvider:'openai',lexicalOnly:!buildVectors});
          if(buildVectors)indexed++;
          versions.set(key,{version,indexed:result?.indexing?.mode==='semantic'});
        }
      }
      return store;
    });
    pendingByUser.set(user.id,pending);
    try{return await pending;}finally{if(pendingByUser.get(user.id)===pending)pendingByUser.delete(user.id);}
  };
}
