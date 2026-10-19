import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApi} from '../server/api.js';
import {createCloud} from '../server/cloud.js';
import {createAccess} from '../server/access.js';

test('cloud HTTP boundary rejects anonymous and foreign-origin writes and scopes state/photos to verified account',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'closet-cloud-api-'));
 const id='11111111-1111-4111-a111-111111111111',origin='https://closet.example',calls=[];
 const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
 const cloud=createCloud({url:'https://test.supabase.co',key:'sb_publishable_test_key_long_enough',origin,fetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return json({id,email:'test@example.com'});
  if(url.includes('/closets?'))return json([{state:{profile:'Private'},revision:3}]);
  if(url.includes('/rpc/save_closet'))return json([{revision:4}]);
  if(url.includes('/storage/'))return new Response('private jpeg');
  throw Error('Unexpected request');
 }});
 const api=createApi({storageDir:directory,cloud,access:createAccess({origin,secret:'test-secret-012345678901234567890123456789',cloud:true})});
 const server=http.createServer(api.middleware);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{api.close();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});});
 const request=(route,{body,cookie='cq_access=test',from=origin}={})=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method:body?'POST':'GET',headers:{host:'closet.example',origin:from,cookie,'content-type':'application/json'}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});
  req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });
 assert.equal((await request('/cloud/closet',{cookie:''})).status,401);
 assert.equal((await request('/cloud/closet',{body:{},from:'https://foreign.example'})).status,403);
 const session=await request('/session');assert.equal(JSON.parse(session.text).authMode,'account');assert.doesNotMatch(session.text,/test-token|"token"/);
 const closet=await request('/cloud/closet');assert.equal(JSON.parse(closet.text).revision,3);
 const state={profile:'Me',xp:0,items:[],completed:[],submissions:[],wardrobeId:'foreign'};
 assert.equal((await request('/cloud/closet',{body:{state,revision:3}})).status,200);
 const write=calls.find(x=>x.url.endsWith('/rpc/save_closet'));assert.equal(JSON.parse(write.options.body).next_state.wardrobeId,id);
 const photo=await request('/cloud/photos/'+('a'.repeat(64))+'.jpg');assert.equal(photo.status,200);assert.equal(photo.headers['cache-control'],'no-store');assert.match(calls.at(-1).url,new RegExp(`/closet-photos/${id}/`));
});
