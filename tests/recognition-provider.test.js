import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createRecognitionProvider } from '../server/recognition-provider.js';
import { createOpenAIChat, createOpenAIEmbeddingClient, openAIModelFor } from '../server/openai.js';

const observation=()=>({subjectStatus:'single_item',itemType:'Trousers',targetDescription:'Centered trousers',colorFamily:'Beige',secondaryColors:[],pattern:'Solid',fit:'Regular',materialAppearance:'Smooth texture',occasions:['Campus casual'],styleTags:['Classic'],reviewNotes:[]});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const completed=data=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{output_tokens:100}});
async function photo() {
  const bytes=await sharp({create:{width:300,height:400,channels:3,background:'#aabbcc'}}).composite([{input:Buffer.from('<svg width="100" height="200"><rect width="100" height="200" fill="#776644"/></svg>')}]).jpeg().toBuffer();
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

test('OpenAI recognition sends normalized JPEG pixels with strict observations and validates before review',async()=>{
  let sent;
  const recognize=createRecognitionProvider({openaiFactory:options=>createOpenAIChat({...options,apiKey:'test-secret',fetchImpl:async(url,request)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(request.body);return response(completed(observation()));}})});
  const result=await recognize(await photo(),{provider:'openai',modelProfile:'fast',wardrobeId:'wardrobe-a'});
  const parts=sent.input[0].content;
  assert.equal(parts[0].type,'input_text');assert.equal(parts[1].type,'input_image');assert.match(parts[1].image_url,/^data:image\/jpeg;base64,/);assert.equal(parts[1].detail,'low');
  assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.text.format.name,'garment_observation');assert.equal(sent.model,openAIModelFor('recognition','fast'));assert.equal(sent.reasoning.effort,'low');
  assert.equal(result.data.category,'Bottom');assert.equal(result.data.reviewRequired,true);assert.equal(result.pipeline.provider,'openai');assert.equal(result.pipeline.cache.hit,false);
});

test('OpenAI failures cannot become cached successful observations or trigger implicit local uploads',async()=>{
  let calls=0,localCalls=0;
  const recognize=createRecognitionProvider({localGenerate:()=>{localCalls++;},openaiFactory:options=>createOpenAIChat({...options,apiKey:'test',fetchImpl:async()=>{calls++;return response(completed({...observation(),itemType:'invented'}));}})});
  const image=await photo(),options={provider:'openai',wardrobeId:'alpha'};
  for(let i=0;i<2;i++)await assert.rejects(recognize(image,options),error=>error.code==='INVALID_RESPONSE');
  assert.equal(calls,2);assert.equal(localCalls,0);
  const missing=createRecognitionProvider({openaiFactory:options=>createOpenAIChat({...options,apiKey:'',fetchImpl:()=>{calls++;}})});
  await assert.rejects(missing(image,options),error=>error.code==='OPENAI_NOT_CONFIGURED');assert.equal(calls,2);
});

test('cache is scoped, bounded, expires and invalidates on profile/crop/model; returned values are isolated',async()=>{
  let calls=0,time=0;
  const cache=new Map(),recognize=createRecognitionProvider({cache,now:()=>time,ttlMs:100,maxEntries:2,localGenerate:async()=>{calls++;return {data:observation(),model:'mock-local',latencyMs:55,tokens:20};}});
  const image=await photo(),options={wardrobeId:'alpha'};
  const first=await recognize(image,options);first.data.name='Mutated';
  const cached=await recognize(image,options);
  assert.equal(calls,1);assert.notEqual(cached.data.name,'Mutated');assert.equal(cached.pipeline.cache.hit,true);assert.equal(cached.tokens,0);assert.equal(cached.usage,undefined);assert.deepEqual(cached.pipeline.stages,[]);
  await recognize(image,{wardrobeId:'other'});assert.equal(calls,2);
  await recognize(image,{...options,modelProfile:'balanced'});assert.equal(calls,3);assert.equal(cache.size,2);
  await recognize(image,options);assert.equal(calls,4,'Oldest entry was evicted.');
  await recognize(image,{...options,crop:{x:0,y:0,width:.8,height:1}});assert.equal(calls,5);
  const previous=process.env.CLOSET_RECOGNITION_MODEL;
  try {process.env.CLOSET_RECOGNITION_MODEL='new-local-model';await recognize(image,options);assert.equal(calls,6);}
  finally {if(previous===undefined)delete process.env.CLOSET_RECOGNITION_MODEL;else process.env.CLOSET_RECOGNITION_MODEL=previous;}
  time=101;await recognize(image,options);assert.equal(calls,7);
  await recognize(image);await recognize(image);assert.equal(calls,9,'Missing wardrobe IDs never share cache.');
});

test('invalid selection and cancellation never infer or cache; a cancelled request cannot cancel another wardrobe',async()=>{
  let calls=0;const cache=new Map();
  const recognize=createRecognitionProvider({cache,localGenerate:async()=>{calls++;return {data:observation()};}});
  const image=await photo();
  for(const [options,code] of [[{provider:'external'},'INVALID_PROVIDER'],[{modelProfile:'arbitrary-model'},'INVALID_MODEL_PROFILE'],[{wardrobeId:'../escape'},'INVALID_WARDROBE_ID']])await assert.rejects(recognize(image,options),error=>error.code===code);
  const controller=new AbortController();controller.abort(new Error('Stopped'));
  await assert.rejects(recognize(image,{signal:controller.signal,wardrobeId:'alpha'}),/Stopped/);assert.equal(calls,0);assert.equal(cache.size,0);
  const late=createRecognitionProvider({cache,localGenerate:async()=>{controller2.abort(new Error('Cancelled during inference'));return {data:observation()};}}),controller2=new AbortController();
  await assert.rejects(late(image,{signal:controller2.signal,wardrobeId:'alpha'}),/Cancelled during inference/);assert.equal(cache.size,0);
  assert.equal((await recognize(image,{wardrobeId:'other'})).data.category,'Bottom');
});

test('the same photo never reuses a local result as an OpenAI result',async()=>{
  let local=0,cloud=0;
  const recognize=createRecognitionProvider({localGenerate:async()=>{local++;return {data:observation(),model:'local-test'};},openaiFactory:()=>async()=>{cloud++;return {data:observation(),model:'openai-test'};}});
  const image=await photo(),scope={wardrobeId:'shared-photo'};
  assert.equal((await recognize(image,scope)).pipeline.provider,'local');
  const result=await recognize(image,{...scope,provider:'openai'});
  assert.equal(result.pipeline.provider,'openai');assert.equal(result.pipeline.cache.hit,false);assert.equal(local,1);assert.equal(cloud,1);
  assert.equal((await recognize(image,{...scope,provider:'openai'})).pipeline.cache.hit,true);assert.equal(cloud,1);
});

test('OpenAI embedding adapter preserves record order, normalizes vectors and uses explicit server auth',async()=>{
  let captured;
  const client=createOpenAIEmbeddingClient({apiKey:'test-secret',dimensions:2,fetchImpl:async(url,options)=>{captured={url,...options};return response({data:[{index:1,embedding:[0,2]},{index:0,embedding:[3,4]}]});}});
  const result=await client.embed([{kind:'query',text:'formal workwear'},{kind:'garment',text:'style document'}]);
  assert.equal(captured.url,'https://api.openai.com/v1/embeddings');assert.equal(captured.headers.Authorization,'Bearer test-secret');assert.equal(captured.redirect,'error');
  assert.deepEqual(JSON.parse(captured.body).input,['formal workwear','style document']);assert.deepEqual(result.vectors,[[.6,.8],[0,1]]);assert.equal(result.metadata.provider,'openai');assert.equal(result.metadata.dimensions,2);assert.equal(result.metadata.model,'text-embedding-3-small');
});

test('embedding failures and malformed vectors remain explicit and bounded',async()=>{
  const records=[{kind:'query',text:'wardrobe'}];let calls=0;
  await assert.rejects(createOpenAIEmbeddingClient({apiKey:'',fetchImpl:()=>{calls++;}}).embed(records),error=>error.code==='OPENAI_NOT_CONFIGURED');assert.equal(calls,0);
  for(const data of [[],[{index:0,embedding:[0,0]}],[{index:0,embedding:[1]}],[{index:1,embedding:[1,2]}],[{index:0,embedding:[1,null]}]]){
    await assert.rejects(createOpenAIEmbeddingClient({apiKey:'test',dimensions:2,fetchImpl:async()=>response({data})}).embed(records),error=>error.code==='OPENAI_INVALID_EMBEDDINGS');
  }
  const client=createOpenAIEmbeddingClient({apiKey:'test',fetchImpl:()=>{calls++;}});
  await assert.rejects(client.embed([{text:''}]),error=>error.code==='INVALID_EMBEDDING_INPUT');assert.equal(calls,0);
  const controller=new AbortController();controller.abort(new Error('Cancelled'));
  await assert.rejects(client.embed(records,{signal:controller.signal}),/Cancelled/);assert.equal(calls,0);
});
