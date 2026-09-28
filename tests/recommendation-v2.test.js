import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend, quickChat } from '../server/recommendation.js';
import { createOpenAIChat } from '../server/openai.js';
import { createDepopClient } from '../server/depop.js';
import { retrieveWardrobeHybrid } from '../server/hybrid-retrieval.js';
import { createEmbeddingClient } from '../server/embeddings.js';
import { createCameraSession, prefillReview } from '../src/camera.js';

const items = [ ['top','Top'], ['bottom','Bottom'], ['shoes','Shoes'], ['dress','Dress'] ].map(([id,category])=>({id,category,name:id,color:'#888888',tags:'Campus casual',wears:0}));
const body = {items,context:'Campus casual',request:'Relaxed pieces',provider:'quick',anchorId:'shoes',requireLowUse:true};
const lexical = (input,options)=>retrieveWardrobeHybrid(input,options,{enabled:false});
const response = (data,status=200)=>new Response(JSON.stringify(data),{status});

test('orchestrator retrieves exactly once, preserves ownership/anchor, and excludes unreviewed items',async()=>{
  let calls=0;
  const result=await recommend({...body,items:[...items,{...items[0],id:'unreviewed',needsReview:true}]},{retrieve:async(...args)=>{calls++;return lexical(...args);}});
  assert.equal(calls,1);assert.equal(result.pipeline.retrievalPasses,1);assert.equal(result.pipeline.provider,'quick');
  assert.ok(result.data.outfits.length>0);
  for(const look of result.data.outfits){assert.ok(look.itemIds.includes('shoes'));assert.ok(!look.itemIds.includes('unreviewed'));assert.ok(look.itemIds.every(id=>items.some(item=>item.id===id)));}
});
test('provider failure and unknown plan IDs fall back using the same retrieved evidence',async()=>{
  for(const generate of [async()=>{throw new Error('provider down');},async()=>({data:{reason:'test',outfits:[{planId:'invented',title:'test',explanation:'test',stylingTip:'test'}]}})]){
    let calls=0;
    const result=await recommend({...body,provider:'openai'},{retrieve:async(...args)=>{calls++;return lexical(...args);},openaiChat:generate});
    assert.equal(calls,1);assert.equal(result.pipeline.provider,'quick');assert.ok(result.pipeline.fallback);assert.ok(result.data.outfits.length);
  }
});
test('valid model abstention is respected; impossible closets and cancellation never invoke a fallback model',async()=>{
  const result=await recommend({...body,provider:'openai'},{retrieve:lexical,openaiChat:async()=>({data:{outfits:[],reason:'No outfit fits this brief.'}})});
  assert.equal(result.data.outfits.length,0);assert.equal(result.pipeline.fallback,null);
  let calls=0;
  await assert.rejects(recommend({...body,items:[items[0]],provider:'openai'},{retrieve:lexical,openaiChat:async()=>{calls++;}}));assert.equal(calls,0);
  const controller=new AbortController();controller.abort();await assert.rejects(recommend(body,{signal:controller.signal,retrieve:async()=>{calls++;}}));assert.equal(calls,0);
});
test('OpenAI Responses uses server bearer auth, strict JSON schema, bounded tokens and no response storage',async()=>{
  let captured;
  const chat=createOpenAIChat({apiKey:'test-only-secret',fetchImpl:async(url,options)=>{captured={url,...options};return response({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"outfits":[],"reason":"test"}'}]}],usage:{output_tokens:11}});}});
  const result=await chat({type:'object'},'system','reviewed descriptions only');
  assert.equal(captured.url,'https://api.openai.com/v1/responses');assert.equal(captured.headers.Authorization,'Bearer test-only-secret');
  const sent=JSON.parse(captured.body);assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.max_output_tokens,1200);assert.equal(result.tokens,11);assert.equal(captured.redirect,'error');
});
test('OpenAI refusal, incomplete output, HTTP errors and invalid JSON are explicit failures',async()=>{
  for(const fixture of [{status:'incomplete',output:[]},{status:'completed',output:[{content:[{type:'refusal',refusal:'no'}]}]},{status:'completed',output:[{content:[{type:'output_text',text:'broken'}]}]}]) {
    await assert.rejects(createOpenAIChat({apiKey:'test',fetchImpl:async()=>response(fixture)})({},'',''),error=>error.code.startsWith('OPENAI_'));
  }
  await assert.rejects(createOpenAIChat({apiKey:'test',fetchImpl:async()=>response({error:'test-only-secret'},401)})({},'',''),error=>error.code==='OPENAI_HTTP_401'&&!error.message.includes('test-only-secret'));
  let calls=0;await assert.rejects(createOpenAIChat({apiKey:'',fetchImpl:async()=>{calls++;}})({},'',''));assert.equal(calls,0);
});
test('OpenAI timeout is bounded and user cancellation propagates',async()=>{
  const hold=(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  const keepAlive=setTimeout(()=>{},200);
  try {await assert.rejects(createOpenAIChat({apiKey:'test',timeoutMs:10,fetchImpl:hold})({},'',''),error=>error.code==='OPENAI_TIMEOUT');}finally{clearTimeout(keepAlive);}
  const controller=new AbortController();controller.abort(new Error('user stopped'));
  await assert.rejects(createOpenAIChat({apiKey:'test',fetchImpl:hold})({},'','',null,{signal:controller.signal}),/user stopped/);
});
test('Depop validates configuration, uses only approved origins, reads shop and paginated products',async()=>{
  let calls=0;
  await assert.rejects(createDepopClient({apiKey:'',fetchImpl:()=>{calls++;}}).shop(),error=>error.code==='DEPOP_NOT_CONFIGURED');assert.equal(calls,0);
  const urls=[];const client=createDepopClient({apiKey:'test-only',environment:'staging',fetchImpl:async(url,options)=>{urls.push(url);assert.equal(options.headers.Authorization,'Bearer test-only');assert.equal(options.redirect,'error');return response(url.includes('/shop/')?{username:'test-shop',id:12,country_code:'US',private:'excluded'}:{data:[{product_id:1,description:'Linen top',price_amount:'20',price_currency:'USD',private:'excluded'}],meta:{has_more:true,cursor:'next'}});}});
  assert.equal((await client.shop()).connected,true);const page=await client.products('abc&bad=true');assert.equal(page.nextCursor,'next');assert.equal(page.products[0].private,undefined);
  assert.ok(urls[1].endsWith('cursor=abc%26bad%3Dtrue'));assert.ok(urls.every(url=>url.startsWith('https://partnerapi-staging.depop.com/')));
  await assert.rejects(createDepopClient({apiKey:'test',fetchImpl:async()=>response({},403)}).shop(),error=>error.code==='DEPOP_HTTP_403');
  await assert.rejects(createDepopClient({apiKey:'test',fetchImpl:async()=>response({})}).products(),error=>error.code==='DEPOP_INVALID_RESPONSE');
});
test('camera tracks stop on close, retake, and late permission resolution',async()=>{
  let resolve,stops=0;
  const camera=createCameraSession({getUserMedia:()=>new Promise(done=>{resolve=done;})});
  const opening=camera.start();camera.stop();resolve({getTracks:()=>[{stop:()=>stops++}]});assert.equal(await opening,null);assert.equal(stops,1);
  const second=camera.start();resolve({getTracks:()=>[{stop:()=>stops++}]});await second;camera.stop();camera.stop();assert.equal(stops,2);
});
test('automatic recognition prefill never overwrites edited details or a replaced photo',()=>{
  const stored={id:'1',name:'Photo',category:'Top',photoKey:'a',needsReview:true,recognition:{status:'review'}};
  assert.equal(prefillReview({...stored},stored,{name:'Blue shirt'}).name,'Blue shirt');
  const edited={...stored,name:'My favorite'};assert.equal(prefillReview(edited,stored,{name:'Blue shirt'}),edited);
  const replaced={...stored,photoKey:'b'};assert.equal(prefillReview(replaced,stored,{name:'Blue shirt'}),replaced);
});
test('memory vectors invalidate on text and model digest changes and cannot be mutated by consumers',async()=>{
  let digest='v1',calls=0;const memoryCache=new Map();
  const client=createEmbeddingClient({dimensions:2,cacheDir:null,memoryCache,getModelIdentity:async()=>({digest}),embedTexts:async texts=>{calls++;return texts.map(()=>[1,2]);}});
  const record=[{kind:'garment',text:'blue shirt'}];const first=await client.embed(record);first.vectors[0][0]=999;
  const cached=await client.embed(record);assert.equal(cached.metadata.cache.memoryHits,1);assert.ok(cached.vectors[0][0]<1);assert.equal(calls,1);
  await client.embed([{...record[0],text:'red shirt'}]);assert.equal(calls,2);digest='v2';await client.embed(record);assert.equal(calls,3);
});
test('OpenAI selection is validated against prepared plans and gets no photo/profile content',async()=>{
  let sent='';const result=await recommend({...body,provider:'openai',profile:'PRIVATE PROFILE',items:items.map(item=>({...item,image:'PRIVATE PHOTO',visibleLabelText:'PRIVATE LABEL'}))},{retrieve:lexical,openaiChat:async(...args)=>{sent=args[2];return quickChat(...args);}});
  assert.equal(result.pipeline.provider,'openai');assert.ok(result.data.outfits.length);assert.equal(sent.includes('PRIVATE'),false);
  assert.equal(result.data.outfits[0].title,'top + bottom','Displayed titles derive from selected wardrobe records.');
});
