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
test('cloud outages distinguish unreachable project, timeout and malformed response without leaking host or credentials',async()=>{
 const cases=[
  {failure:Object.assign(Error('fetch failed private-host'),{cause:{code:'ENOTFOUND'}}),code:'CLOUD_PROJECT_UNREACHABLE'},
  {failure:Object.assign(Error('timed out private-host'),{name:'TimeoutError'}),code:'CLOUD_TIMEOUT'},
  {failure:Error('offline private-host'),code:'CLOUD_UNAVAILABLE'},
  {result:new Response('<html>not JSON</html>'),code:'CLOUD_INVALID_RESPONSE'},
 ];
 for(const c of cases){
  let cleared=false;
  const cloud=createCloud({...config,fetchImpl:async()=>{if(c.failure)throw c.failure;return c.result;}});
  await assert.rejects(()=>cloud.authenticate({headers:{cookie:'cq_access=private-token'}},{setHeader(){cleared=true;}}),e=>{
   assert.equal(e.status,503);assert.equal(e.code,c.code);assert.doesNotMatch(e.message,/private-host|private-token|supabase\.co/);return true;
  });
  assert.equal(cleared,false,'Transient outages must not clear the existing session.');
 }
});
test('password login recognizes raw and normalized invalid-credential codes without claiming whether an account exists',async()=>{
 for(const body of [{error_code:'invalid_credentials',msg:'private-password'}, {code:'invalid_credentials',message:'private-email@example.com'}]){
  let calls=0,cookies=0;
  const cloud=createCloud({...config,fetchImpl:async()=>{calls++;return response(body,400);}});
  await assert.rejects(()=>cloud.auth('login',{email:'test@example.com',password:'test-password'},{headers:{}},{setHeader(){cookies++;}}),e=>{
   assert.equal(e.status,401);assert.equal(e.code,'INVALID_CREDENTIALS');assert.match(e.message,/email and password combination/);assert.match(e.message,/Create an account/);
   assert.doesNotMatch(e.message,/private-password|private-email|does not exist|account was deleted/);return true;
  });
  assert.equal(calls,1);assert.equal(cookies,0);
 }
});
test('signup and reset report a delivery problem only for known delivery codes or exact upstream mail-step errors',async()=>{
 for(const [action,status,body] of [
  ['signup',500,{error_code:'unexpected_failure',msg:'Error sending confirmation email',error:'525 private SMTP credential and IP'}],
  ['recover',500,{code:'unexpected_failure',message:'Error sending recovery email',debug:'private-token'}],
  ['signup',400,{code:'email_address_not_authorized',message:'private-address@example.com'}],
  ['recover',422,{error_code:'email_address_not_authorized',msg:'private-address@example.com'}],
 ]){
  let calls=0,cookies=0;
  const cloud=createCloud({...config,fetchImpl:async()=>{calls++;return response(body,status);}});
  await assert.rejects(()=>cloud.auth(action,{email:'test@example.com',password:'test-password'},{headers:{}},{setHeader(){cookies++;}}),e=>{
   assert.equal(e.status,503);assert.equal(e.code,'EMAIL_DELIVERY_FAILED');assert.match(e.message,/email step failed/);
   if(action==='signup')assert.match(e.message,/not signed in/);else assert.match(e.message,/does not confirm whether an account exists/);
   assert.doesNotMatch(e.message,/525|SMTP|private-|@|\d+\.\d+\.\d+\.\d+/);return true;
  });
  assert.equal(calls,1);assert.equal(cookies,0);
 }
});
test('unrelated signup failures and provider rate limits never invent an email-delivery diagnosis or expose upstream details',async()=>{
 for(const [status,body,code] of [
  [500,{error_code:'unexpected_failure',msg:'Database error saving new user',password:'private-password'},'SIGNUP_FAILED'],
  [500,{code:'unexpected_failure',message:'Error sending recovery email'},'SIGNUP_FAILED'],
  [500,{message:'Error sending confirmation email: private-password'},'SIGNUP_FAILED'],
  [500,null,'SIGNUP_FAILED'],
  [400,{code:'invalid_credentials'},'SIGNUP_FAILED'],
  [429,{code:'over_email_send_rate_limit',msg:'Error sending confirmation email'},'AUTH_RATE_LIMITED'],
 ]){
  const cloud=createCloud({...config,fetchImpl:async()=>response(body,status)});
  await assert.rejects(()=>cloud.auth('signup',{email:'test@example.com',password:'test-password'},{headers:{}},{setHeader(){assert.fail('A failed signup cannot create a session');}}),e=>{
   assert.equal(e.status,status);assert.equal(e.code,code);assert.doesNotMatch(e.message,/private-password|Database error|email step failed/);
   assert.match(e.message,status===429?/wait/:/Account creation did not finish successfully/);return true;
  });
 }
});
test('mail errors remain action-scoped and reset success retains the same non-enumerating response',async()=>{
 const failed=createCloud({...config,fetchImpl:async()=>response({msg:'Error sending confirmation email'},500)});
 await assert.rejects(()=>failed.closet({id,token:'t'}),e=>e.code==='CLOUD_REQUEST_FAILED'&&!e.message.includes('email'));
 const recoverFailure=createCloud({...config,fetchImpl:async()=>response({code:'unexpected_failure',msg:'private-error'},500)});
 await assert.rejects(()=>recoverFailure.auth('recover',{email:'test@example.com'},{headers:{}},{}),e=>e.code==='RECOVERY_FAILED'&&!e.message.includes('private-error'));
 const confirmed=createCloud({...config,fetchImpl:async()=>response({error_code:'email_not_confirmed'},400)});
 await assert.rejects(()=>confirmed.auth('login',{email:'test@example.com',password:'test-password'},{headers:{}},{}),e=>e.code==='EMAIL_NOT_CONFIRMED');
 const healthy=createCloud({...config,fetchImpl:async()=>response({})});
 const result=await healthy.auth('recover',{email:'test@example.com'},{headers:{}},{});
 assert.equal(result.message,'If an account exists, a reset link is on its way. Check your inbox.');
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
