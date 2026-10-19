import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloud,validateCloudState} from '../server/cloud.js';
import {createSyncQueue,prepareCloudSnapshot} from '../src/cloud-sync.js';
const id='11111111-1111-4111-a111-111111111111';
const config={url:'https://project.supabase.co',key:'sb_publishable_test_key_long_enough',origin:'https://closet.example'};
const state={profile:'Test',xp:0,completed:[],submissions:[],items:[{id:'tee',name:'Tee',image:'photos/tee.jpg'}]};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('cloud configuration fails closed and rejects service secrets',()=>{
 assert.throws(()=>createCloud({...config,key:'sb_secret_never_use_admin_here'}));
 assert.throws(()=>createCloud({...config,key:'header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature'}));
 assert.throws(()=>createCloud({...config,url:'http://project.supabase.co'}));
 assert.throws(()=>createCloud({...config,url:'https://attacker.example'}));
});
test('closet validation pins account identity and rejects unuploaded or foreign image URLs',()=>{
 assert.equal(validateCloudState({...state,wardrobeId:'other'},id).wardrobeId,id);
 for(const image of ['https://attacker.example/photo','data:image/jpeg;base64,x','/api/cloud/photos/../other'])assert.throws(()=>validateCloudState({...state,items:[{id:'t',name:'T',image}]},id));
 assert.throws(()=>validateCloudState({...state,items:[...state.items,...state.items]},id));
});
test('account sessions are validated remotely and tokens never appear in public user',async()=>{
 const cloud=createCloud({...config,fetchImpl:async(url,opts)=>{assert.ok(url.endsWith('/auth/v1/user'));assert.equal(opts.headers.Authorization,'Bearer actual-token');return response({id,email:'test@example.com'});}});
 const user=await cloud.authenticate({headers:{cookie:'cq_access=actual-token'}},{setHeader(){}});
 assert.equal(user.namespace,id);assert.equal(cloud.publicUser(user).token,undefined);
 assert.equal(await cloud.authenticate({headers:{}},{setHeader(){}}),null);
});
test('concurrent expired sessions share one refresh and set HttpOnly secure cookies',async()=>{
 let refreshes=0;const headers=[];
 const cloud=createCloud({...config,fetchImpl:async(url,opts)=>{
  if(url.includes('grant_type=refresh_token')){refreshes++;await new Promise(r=>setTimeout(r,10));return response({access_token:'fresh-token',refresh_token:'fresh-refresh'});}
  return opts.headers.Authorization==='Bearer old-token'?response({},401):response({id,email:'test@example.com'});
 }});
 const req={headers:{cookie:'cq_access=old-token; cq_refresh=old-refresh'}},res={setHeader:(_k,v)=>headers.push(v)};
 const users=await Promise.all([cloud.authenticate(req,res),cloud.authenticate(req,res)]);
 assert.equal(refreshes,1);assert.equal(users[0].id,id);assert.ok(headers.flat().every(v=>v.includes('HttpOnly')&&v.includes('Secure')&&v.includes('SameSite=Lax')));
});
test('expired refresh clears session, network failure does not masquerade as signed out',async()=>{
 const headers=[];const cloud=createCloud({...config,fetchImpl:async()=>response({},401)});
 assert.equal(await cloud.authenticate({headers:{cookie:'cq_refresh=old'}},{setHeader:(_k,v)=>headers.push(v)}),null);
 assert.ok(headers.flat().every(v=>v.includes('Max-Age=0')));
 const offline=createCloud({...config,fetchImpl:async()=>{throw Error('offline');}});
 await assert.rejects(()=>offline.authenticate({headers:{cookie:'cq_access=x'}},{setHeader(){}}),e=>e.status===503);
});
test('cloud write carries user JWT and stale revisions produce conflict',async()=>{
 const calls=[];const cloud=createCloud({...config,fetchImpl:async(url,opts)=>{calls.push({url,opts});return response([]);}});
 await assert.rejects(()=>cloud.saveCloset({id,token:'user-token'},{state,revision:3}),e=>e.code==='SYNC_CONFLICT');
 const body=JSON.parse(calls[0].opts.body);assert.equal(body.expected_revision,3);assert.equal(body.next_state.wardrobeId,id);assert.equal(calls[0].opts.headers.Authorization,'Bearer user-token');
});
test('private image requests always derive the storage folder from the verified account',async()=>{
 let seen;const cloud=createCloud({...config,fetchImpl:async(url)=>{seen=url;return new Response('jpeg');}});
 await cloud.photo({id,token:'t'},'a'.repeat(64)+'.jpg');assert.ok(seen.includes(`/closet-photos/${id}/`));
 await assert.rejects(()=>cloud.photo({id,token:'t'},'../../other.jpg'),e=>e.status===404);
});
test('sync serializes rapid edits using the revision returned by each prior save',async()=>{
 let release;const gate=new Promise(r=>release=r),calls=[],commits=[];
 const q=createSyncQueue({revision:4,persist(){},write:async(s,rev)=>{calls.push({s,rev});if(calls.length===1)await gate;return {revision:rev+1};},onCommitted:s=>commits.push(s)});
 q.enqueue({n:1});const run=q.flush();q.enqueue({n:2});q.enqueue({n:3});release();await run;
 assert.deepEqual(calls,[{s:{n:1},rev:4},{s:{n:3},rev:5}]);assert.deepEqual(commits,[{n:3}]);assert.equal(q.pending,false);
});
test('a conflict preserves local changes and blocks automatic overwrites',async()=>{
 let calls=0,pending;const q=createSyncQueue({revision:2,persist:v=>pending=v,write:async()=>{calls++;throw Object.assign(Error('conflict'),{status:409});}});
 q.enqueue({n:1});await assert.rejects(q.flush);q.enqueue({n:2});await assert.rejects(q.flush);
 assert.equal(calls,1);assert.deepEqual(pending,{state:{n:2},revision:2});assert.equal(q.pending,true);
});
test('photo preparation uploads once, preserves original state, and never commits failed uploads',async()=>{
 const source={...state,items:[{id:'x',image:'data:image/jpeg;base64,a'},{id:'y',image:'data:image/jpeg;base64,a'}]},cache=new Map();let count=0;
 const result=await prepareCloudSnapshot(source,async()=>{count++;return {image:'/api/cloud/photos/'+('a'.repeat(64))+'.jpg'};},cache);
 assert.equal(count,1);assert.ok(source.items[0].image.startsWith('data:'));assert.ok(result.items[0].image.startsWith('/api/cloud/'));
 await assert.rejects(()=>prepareCloudSnapshot(source,async()=>{throw Error('upload failed');}));
});
