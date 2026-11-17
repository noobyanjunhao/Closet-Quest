import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilityStatus} from '../server/capability-status.js';
import {createApi} from '../server/api.js';
import {modelFor} from '../server/model-config.js';
const models={recognition:'vision',stylist:'style',embedding:'vectors'};
const installedModels=Object.values(models).map(name=>({name}));

test('hosted capabilities never offer local models or mistake a key for verified inference',()=>{
  const status=capabilityStatus({hosted:true,models,installedModels,openai:{configured:true,model:'configured-model'},depop:{configured:true}});
  assert.equal(status.localInferenceAvailable,false);assert.equal(status.localRecognitionReady,false);assert.equal(status.ready,false);
  assert.deepEqual(status.capabilities.recognition.providers,['openai']);assert.deepEqual(status.capabilities.styling.providers,['auto','quick','openai']);
  assert.equal(status.openai.verified,false);assert.equal(status.openai.verification,'configuration-only');
  assert.equal(status.recognitionReady,true);assert.equal(status.recommendationReady,true);
  assert.equal(status.depop.available,false);
});
test('local discovery preserves compatibility and Quick remains available without installed models',()=>{
  const installed=capabilityStatus({models,installedModels});assert.equal(installed.ready,true);assert.equal(installed.embeddingReady,true);
  assert.deepEqual(installed.capabilities.recognition.providers,['local']);
  const empty=capabilityStatus({models});assert.equal(empty.ready,false);assert.equal(empty.recognitionReady,false);
  assert.deepEqual(empty.capabilities.styling.providers,['auto','quick']);
  assert.equal(capabilityStatus({models,installedModels:{invalid:true}}).ready,false);
});
test('offline styling restricts model choices without falsely disabling other configured services',()=>{
  const status=capabilityStatus({models,installedModels,openai:{configured:true},stylistPolicy:'offline',purchaseImports:{enabled:true,provider:'worker'}});
  assert.deepEqual(status.capabilities.styling.providers,['auto','quick']);
  assert.deepEqual(status.capabilities.embeddings.providers,['openai','local']);
  assert.equal(status.capabilities.purchaseImports.provider,'worker');
  const invalid=capabilityStatus({models,stylistPolicy:'typo'});assert.equal(invalid.recommendationReady,false);assert.deepEqual(invalid.capabilities.styling.providers,[]);
});
test('hosted status route skips local discovery, while a local server still discovers models',async()=>{
  for(const hosted of [true,false]){
    let calls=0,result;
    const api=createApi({storageDir:null,cloud:null,access:{hosted,checkOrigin(){},require(){return {id:'test',namespace:'test'};}},shoppingLibrary:{},purchaseOptions:{enabled:false},services:{listModels:async()=>{calls++;return{models:['recognition','stylist','embedding'].map(role=>({name:modelFor(role)}))};}}});
    try{
      await api.middleware({method:'GET',url:'/status',headers:{}},{setHeader(){},end(value){result=JSON.parse(value);}});
      assert.equal(calls,hosted?0:1);assert.equal(result.hosted,hosted);assert.equal(result.localInferenceAvailable,!hosted);
      assert.equal(result.ready,!hosted);assert.equal(result.openai.verified,false);
    }finally{api.close();}
  }
});
