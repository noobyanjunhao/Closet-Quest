import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import sharp from 'sharp';
import {createEventAvatar,characterFromObservation,CHARACTER_SCHEMA,CHARACTER_INSTRUCTIONS,EVENT_AVATAR_PATH} from '../server/event-avatar.js';
import {manifest} from '../src/event/manifest.js';
import {createDefaultSpec,applyCharacter,validateSpec,reducer,createInitialState} from '../src/event/state.js';
import {requestCharacter,likenessAvailable,encodePhoto,LIKENESS_ENDPOINT} from '../src/event/likeness.js';

const observation={person_visible:true,top:{type:'hoodie',color:'#3366cc'},bottom:{type:'shorts',color:'#222222'},shoes:{type:'boots',color:'#7A5238'},hair:{type:'curly',color:'#1F1B1E'},skin_color:'#A66B46',headwear:{type:'cap',color:'#E0705A'},glasses:false};
const jpeg=await sharp({create:{width:40,height:60,channels:3,background:'#3366cc'}}).jpeg().toBuffer();
const ON={CLOSET_EVENT_AI:'1'};

async function serve(t,options){
  const avatar=createEventAvatar(options),server=http.createServer((req,res)=>avatar.handle(req,res));
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const host=`127.0.0.1:${server.address().port}`;
  const call=(body,{method='POST',headers={},raw}={})=>new Promise((resolve,reject)=>{
    const request=http.request(`http://${host}${EVENT_AVATAR_PATH}`,{method,headers:{origin:`http://${host}`,'content-type':'application/json',...headers}},response=>{let text='';response.on('data',c=>text+=c);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,json:text?JSON.parse(text):null}));});
    request.on('error',reject);request.end(raw??(body===undefined?undefined:JSON.stringify(body)));
  });
  return {call,avatar,host};
}
const photo={consent:true,image:jpeg.toString('base64')};

test('the model schema only offers manifest parts, and its reply is mapped through validated edits',()=>{
  assert.deepEqual(CHARACTER_SCHEMA.properties.top.properties.type.enum,manifest.tops.map(t=>t.id));assert.equal(CHARACTER_SCHEMA.additionalProperties,false);
  assert.match(CHARACTER_INSTRUCTIONS,/Never identify the person/);assert.match(CHARACTER_INSTRUCTIONS,/gender, age, ethnicity/);
  const character=characterFromObservation(observation);
  assert.deepEqual(character,{outfit:{topId:'hoodie',topColor:'#3366CC',bottomId:'shorts',bottomColor:'#222222',shoeId:'boots',shoeColor:'#7A5238'},appearance:{skinColor:'#A66B46',hairId:'curly',hairColor:'#1F1B1E',headwearId:'cap',headwearColor:'#E0705A',glasses:false}});
  const odd=characterFromObservation({...observation,top:{type:'cape',color:'javascript:1'},skin_color:'tan',glasses:'yes',extra:{a:1}});
  assert.equal(odd.outfit.topId,'jacket');assert.equal(odd.outfit.topColor,'#627F62');assert.equal(odd.appearance.glasses,true);assert.equal(JSON.stringify(odd).includes('javascript'),false);
  for(const none of [null,'x',{},{...observation,person_visible:false},{...observation,person_visible:'true'}])assert.equal(characterFromObservation(none),null);
});

test('a consented JPEG returns a character; the model sees a re-encoded copy and nothing is echoed back',async t=>{
  const seen=[];const {call}=await serve(t,{env:ON,analyze:async image=>{seen.push(image);return observation;}});
  const response=await call(photo);assert.equal(response.status,200);assert.equal(response.headers['cache-control'],'no-store');
  assert.deepEqual(Object.keys(response.json),['character']);assert.equal(response.json.character.outfit.topId,'hoodie');
  assert.equal(seen.length,1);const meta=await sharp(Buffer.from(seen[0],'base64')).metadata();assert.equal(meta.format,'jpeg');assert.ok(Math.max(meta.width,meta.height)<=768);
  assert.equal((await call(undefined,{method:'GET'})).json.available,true);
});

test('requests without consent, a valid JPEG, JSON or the same origin never reach the model',async t=>{
  let calls=0;const {call}=await serve(t,{env:ON,analyze:async()=>{calls++;return observation;}});
  const png=(await sharp({create:{width:4,height:4,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64');
  const cases=[[{image:photo.image},{},400],[{consent:'true',image:photo.image},{},400],[{consent:true},{},400],[{consent:true,image:'not base64!'},{},400],[{consent:true,image:png},{},400],[{consent:true,image:Buffer.from([0xff,0xd8,1,2,3]).toString('base64')},{},400],
    [photo,{headers:{origin:'https://evil.example'}},403],[photo,{headers:{origin:''}},403],[photo,{headers:{'content-type':'text/plain'}},400],[undefined,{raw:'[1]'},400],[undefined,{raw:'{'},400],[{consent:true,image:'A'.repeat(800000)},{},413],[undefined,{method:'DELETE'},405]];
  for(const [body,options,status] of cases){const response=await call(body,options);assert.equal(response.status,status,JSON.stringify(options)+String(JSON.stringify(body)).slice(0,60));assert.equal(typeof response.json.error,'string');}
  assert.equal(calls,0);
});

test('spending guards: off by default, total cap, per-visitor cap and failures still count',async t=>{
  for(const env of [{},{CLOSET_EVENT_AI:'0',OPENAI_API_KEY:'k'},{OPENAI_API_KEY:'k'},{CLOSET_EVENT_AI:'1'}]){
    const avatar=createEventAvatar({env});assert.equal(avatar.stats().enabled,false,JSON.stringify(env));
  }
  assert.equal(createEventAvatar({env:{CLOSET_EVENT_AI:'1',OPENAI_API_KEY:'k'}}).stats().enabled,true);
  assert.equal(createEventAvatar({env:{...ON,CLOSET_EVENT_AI_MAX_CALLS:'12'},analyze:async()=>observation}).stats().maxCalls,12);
  assert.equal(createEventAvatar({env:{...ON,CLOSET_EVENT_AI_MAX_CALLS:'999999'},analyze:async()=>observation}).stats().maxCalls,150);
  const off=await serve(t,{env:{}});assert.equal((await off.call(photo)).status,503);assert.equal((await off.call(undefined,{method:'GET'})).json.available,false);

  let calls=0;const capped=await serve(t,{env:ON,limits:{maxCalls:3,perVisitor:10},analyze:async()=>{calls++;if(calls===2)throw Object.assign(Error('sk-secret upstream detail'),{status:503});return calls===3?{...observation,person_visible:false}:observation;}});
  assert.equal((await capped.call(photo)).status,200);
  const failed=await capped.call(photo);assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(failed.json),/secret|upstream/);
  assert.equal((await capped.call(photo)).status,422);
  const full=await capped.call(photo);assert.equal(full.status,429);assert.equal(full.json.code,'EVENT_AI_FULL');assert.equal(calls,3);assert.equal(capped.avatar.stats().calls,3);
  assert.equal((await capped.call(undefined,{method:'GET'})).json.available,false);

  let visits=0;const visitor=await serve(t,{env:ON,limits:{perVisitor:2},analyze:async()=>{visits++;return observation;}});
  await visitor.call(photo);await visitor.call(photo);const third=await visitor.call(photo);assert.equal(third.status,429);assert.equal(third.json.code,'VISITOR_LIMIT');assert.equal(visits,2);

  const gates=[];const busy=await serve(t,{env:ON,limits:{concurrency:1},analyze:()=>new Promise(resolve=>gates.push(resolve))});
  const first=busy.call(photo);while(!gates.length)await new Promise(r=>setTimeout(r,5));
  assert.equal((await busy.call(photo)).status,503);gates[0](observation);assert.equal((await first).status,200);assert.equal(busy.avatar.stats().active,0);
});

test('the browser client sends one consented JPEG without credentials and validates what comes back',async()=>{
  const requests=[],reply=(status,body)=>async(url,init)=>{requests.push({url,init});return{ok:status<300,status,json:async()=>body};};
  const encode=async()=>'QUJD';
  const character=characterFromObservation(observation);
  assert.deepEqual(await requestCharacter({},{fetchImpl:reply(200,{character}),encode}),character);
  const sent=requests[0];assert.equal(sent.url,LIKENESS_ENDPOINT);assert.equal(sent.init.method,'POST');assert.equal(sent.init.credentials,'omit');assert.deepEqual(JSON.parse(sent.init.body),{consent:true,image:'QUJD'});
  await assert.rejects(requestCharacter({},{fetchImpl:reply(429,{error:'Limit reached.'}),encode}),/Limit reached/);
  await assert.rejects(requestCharacter({},{fetchImpl:reply(500,{error:'x'.repeat(500)}),encode}),/build yours by hand/);
  await assert.rejects(requestCharacter({},{fetchImpl:reply(200,{character:{outfit:null}}),encode}),/build yours by hand/);
  await assert.rejects(requestCharacter({},{fetchImpl:async()=>{throw Error('offline');},encode}),/No connection/);
  const stopped=new AbortController();stopped.abort();await assert.rejects(requestCharacter({},{fetchImpl:async(u,i)=>{i.signal.throwIfAborted();},signal:stopped.signal,encode}));
  assert.equal(await likenessAvailable({fetchImpl:reply(200,{available:true})}),true);assert.equal(await likenessAvailable({fetchImpl:reply(200,{available:'yes'})}),false);assert.equal(await likenessAvailable({fetchImpl:reply(503,{})}),false);assert.equal(await likenessAvailable({fetchImpl:async()=>{throw Error();}}),false);
  const drawn=[];const canvas=(width,height)=>({width,height,getContext:()=>({drawImage:(...a)=>drawn.push(a)}),toDataURL:(type,q)=>`data:${type};base64,AAAA`});
  assert.equal(await encodePhoto({width:1024,height:512,canvas:{}},{createCanvas:canvas}),'AAAA');assert.deepEqual(drawn[0].slice(3),[768,384]);
  await assert.rejects(encodePhoto({width:10,height:10,canvas:{}},{createCanvas:(w,h)=>({...canvas(w,h),toDataURL:()=>'data:image/png;base64,AA'})}));
});

test('a suggested character is applied field by field, stays editable and keeps the nickname and scene',()=>{
  const spec=createDefaultSpec({nickname:'Mossy Comet',sceneId:'campus-walk'}),character=characterFromObservation(observation);
  const next=applyCharacter(spec,character);assert.equal(validateSpec(next).ok,true);assert.equal(next.outfit.topId,'hoodie');assert.equal(next.appearance.hairId,'curly');assert.equal(next.nickname,'Mossy Comet');assert.equal(next.sceneId,'campus-walk');
  const hostile=applyCharacter(spec,{outfit:{topId:'cape',topColor:'url(x)',presetId:'sky-scarf',wardrobeId:'w'},appearance:{glasses:'no',email:'a@b.c'},nickname:'<img>',sceneId:'moon',__proto__:{x:1}});
  assert.deepEqual(hostile,spec);for(const junk of [null,'x',[],{outfit:[]},{appearance:'x'}])assert.equal(applyCharacter(spec,junk),spec);
  let state=reducer(createInitialState(()=>0),{type:'start',photoFirst:true});assert.equal(state.screen,'photo');
  assert.equal(reducer(createInitialState(()=>0),{type:'start'}).screen,'edit');
  state=reducer(state,{type:'likeness',character});assert.equal(state.screen,'edit');assert.equal(state.fromPhoto,true);assert.equal(state.spec.outfit.topColor,'#3366CC');
  state=reducer(state,{type:'edit',field:'topId',value:'knit'});assert.equal(state.spec.outfit.topId,'knit');assert.equal(state.spec.outfit.topColor,'#3366CC');
  const skipped=reducer(reducer(createInitialState(()=>0),{type:'start',photoFirst:true}),{type:'likeness',character:null});assert.equal(skipped.screen,'edit');assert.equal(skipped.fromPhoto,false);
});
