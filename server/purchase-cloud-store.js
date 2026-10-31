import {fail} from './purchase-contract.js';

// Same publishable key + verified user JWT as other cloud operations. Never a
// service-role key. Every table and RPC is guarded by owner RLS in migration 003.
export function createPurchaseCloudStore(cloud){
 const request=(user,path,options)=>cloud.purchaseRequest(user,path,options);
 const safeId=id=>{if(!/^[a-f\d-]{36}$/i.test(id))throw fail('Import not found.','IMPORT_NOT_FOUND',404);return id;};
 return {
  health(user){return request(user,'rpc/purchase_worker_health',{method:'POST',body:{}});},
  recover(){/* Per-draft leases reconcile interrupted remote workers on read. */},
  async get(owner,id,user){return (await request(user,`purchase_imports?id=eq.${safeId(id)}&user_id=eq.${owner}&select=payload`))[0]?.payload||null;},
  async list(owner,user){return (await request(user,`purchase_imports?user_id=eq.${owner}&select=payload&limit=100&order=id.desc`)).map(r=>r.payload);},
  async create(d,user){
   const path=`purchase_imports?user_id=eq.${d.owner}&create_key=eq.${encodeURIComponent(d.createKey)}&select=payload`;
   const read=async()=>{const old=(await request(user,path))[0]?.payload;if(old&&(old.source.hash!==d.source.hash||old.provider!==d.provider))throw fail('This key belongs to different text.','IMPORT_KEY_CONFLICT',409);return old;};
   const old=await read();if(old)return old;
   if((await this.list(d.owner,user)).length>=100)throw fail('Remove old drafts before adding more.','IMPORT_LIMIT_EXCEEDED',429);
   try{await request(user,'purchase_imports',{method:'POST',body:{id:d.id,user_id:d.owner,create_key:d.createKey,revision:d.revision,payload:d}});return d;}
   catch(e){const concurrent=await read();if(concurrent)return concurrent;throw e;}
  },
  async save(d,expected,{commit,user}={}){
   try{return await request(user,'rpc/save_purchase_import',{method:'POST',body:{draft_id:d.id,expected_revision:expected,next_draft:d,commit_data:commit||null}});}
   catch(e){if(e.status===409)throw fail('This review or closet changed. Reload before retrying.','IMPORT_REVISION_CONFLICT',409);throw e;}
  },
  async committed(owner,key,user){const row=(await request(user,`purchase_import_commits?user_id=eq.${owner}&commit_key=eq.${encodeURIComponent(key)}&select=import_id,request_hash,result`))[0];return row?{importId:row.import_id,hash:row.request_hash,result:row.result}:null;},
  async remove(owner,id,user){const d=await this.get(owner,id,user);if(!d)throw fail('Import not found.','IMPORT_NOT_FOUND',404);if(['queued','extracting'].includes(d.status))throw fail('Cancel this draft first.','IMPORT_INVALID_STATE',409);
   if(d.status==='committed'){d.source={hash:d.source.hash,text:'',lines:[]};d.items=[];d.audit=[];delete d.extraction;d.sourceRemoved=true;await request(user,'rpc/purge_purchase_source',{method:'POST',body:{draft_id:id}});}
   else await request(user,`purchase_imports?id=eq.${safeId(id)}&user_id=eq.${owner}`,{method:'DELETE'});return {removed:true};},
  close(){}
 };
}
