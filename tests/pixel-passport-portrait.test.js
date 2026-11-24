import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createEventPortrait,generatePortrait,PORTRAIT_STYLES,PORTRAIT_MODEL} from '../server/event-portrait.js';

const env={CLOSET_EVENT_AI:'1',OPENAI_API_KEY:'k'};
function call(portrait,{method='POST',body,origin='http://localhost:4173',ip='1.1.1.1'}={}){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  Object.assign(req,{method,headers:{host:'localhost:4173',origin,'content-type':'application/json'},socket:{remoteAddress:ip}});
  return new Promise(resolve=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){resolve({status:this.statusCode,body:JSON.parse(text)});}};portrait.handle(req,res);});
}
const ok=()=>createEventPortrait({env,normalize:async image=>image,generate:async(image,style)=>({image:'QUJD',usage:{inputTokens:10,outputTokens:20},style})});

test('portrait endpoint needs consent, a listed style and the same origin, and stays off without the flag',async()=>{
  assert.equal((await call(createEventPortrait({env:{},generate:async()=>({image:'x'})}),{body:{consent:true,style:'sticker',image:'QUJD'}})).status,503);
  const p=ok();
  assert.equal((await call(p,{body:{consent:false,style:'sticker',image:'QUJD'}})).body.code,'CONSENT_REQUIRED');
  assert.equal((await call(p,{body:{consent:true,style:'oil',image:'QUJD'}})).body.code,'BAD_STYLE');
  assert.equal((await call(p,{origin:'https://evil.example',body:{consent:true,style:'sticker',image:'QUJD'}})).status,403);
  assert.equal(p.stats().calls,0,'rejected requests spend nothing');
  const done=await call(p,{body:{consent:true,style:'ink',image:'QUJD'}});
  assert.equal(done.status,200);assert.deepEqual(done.body,{image:'QUJD',style:'ink'});assert.equal(p.stats().recent[0].usage.outputTokens,20);
});
test('portrait spending is capped per visitor and overall, and failures still count',async()=>{
  const p=createEventPortrait({env,limits:{maxCalls:3,perVisitor:2},normalize:async i=>i,generate:async()=>{throw new Error('provider down');}});
  const body={consent:true,style:'sticker',image:'QUJD'};
  assert.equal((await call(p,{body})).status,502);assert.equal((await call(p,{body})).status,502);
  assert.equal((await call(p,{body})).body.code,'VISITOR_LIMIT');
  assert.equal((await call(p,{body,ip:'2.2.2.2'})).status,502);
  assert.equal((await call(p,{body,ip:'3.3.3.3'})).body.code,'PORTRAIT_FULL');
  assert.equal(p.stats().calls,3);assert.equal((await call(p,{method:'GET'})).body.available,false);
});
test('the image request asks for a redrawn full-body figure and never stores or identifies',async()=>{
  let sent;const out=await generatePortrait({apiKey:'k',image:'QUJD',style:'sticker',fetchImpl:async(url,init)=>{sent={url,body:JSON.parse(init.body),auth:init.headers.Authorization};return Response.json({data:[{b64_json:'UElD'}],usage:{input_tokens:5,output_tokens:9}});}});
  assert.equal(sent.url,'https://api.openai.com/v1/images/edits');assert.equal(sent.body.model,PORTRAIT_MODEL);assert.equal(sent.body.quality,'low');assert.equal(sent.body.n,1);
  assert.equal(sent.body.images[0].image_url,'data:image/jpeg;base64,QUJD');
  assert.match(sent.body.prompt,/redraw everything from scratch/);assert.match(sent.body.prompt,/head to shoes/);assert.doesNotMatch(sent.body.prompt,/name|who (?:this|they) (?:is|are)/i);
  assert.deepEqual(out,{image:'UElD',usage:{inputTokens:5,outputTokens:9}});assert.deepEqual(Object.keys(PORTRAIT_STYLES),['sticker','oneline','fashion','ink']);for(const text of Object.values(PORTRAIT_STYLES))assert.doesNotMatch(text,/nobel|in the style of [A-Z]/i,'styles are described by technique, not by naming an artist or award');
  await assert.rejects(generatePortrait({apiKey:'k',image:'QUJD',style:'sticker',fetchImpl:async()=>Response.json({error:{code:'moderation_blocked'}},{status:400})}),{code:'PORTRAIT_REFUSED'});
});
