import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createApi} from '../server/api.js';

const owner={id:'test-user',namespace:'test-wardrobe',cloud:true};
function setup(t,{services={},knowledgeStore,cloud=null}={}){
 const api=createApi({storageDir:null,cloud,access:{hosted:true,checkOrigin(){},require(){return owner;},allowInference(){}},shoppingLibrary:{},purchaseOptions:{enabled:false},services,knowledgeStore});
 t.after(()=>api.close());return api;
}
async function post(api,url,body){
 const req=Object.assign(new EventEmitter(),{method:'POST',url,headers:{'content-type':'application/json'},resume(){}});
 let data;const res=Object.assign(new EventEmitter(),{statusCode:200,setHeader(){},end(value){data=JSON.parse(value);this.writableEnded=true;}});
 const pending=api.middleware(req,res);
 // Authentication may await before registering body listeners.
 setImmediate(()=>{req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');});
 await pending;return {status:res.statusCode,data};
}
const brief={provider:'quick',request:'Something formal',allowPartial:true,context:'Campus casual',items:[{id:'tee',name:'Cotton tee',category:'Top',color:'#888888',wears:0}],preferences:{embeddingProvider:'local'}};

test('hosted retrieval disables dense search for a saved local preference without changing provider',async t=>{
 let dependency,request;
 const api=setup(t,{services:{retrieveWardrobeHybrid:async(items,options,deps)=>{dependency=deps;request=options;return{items,retrieval:{items:items.map(item=>({id:item.id,score:1}))}};}}});
 const result=await post(api,'/retrieve',{...brief,provider:'openai',preferences:{embeddingProvider:'local',modelProfile:'balanced'}});
 assert.equal(result.status,200);assert.equal(dependency.enabled,false);assert.equal(request.preferences.embeddingProvider,'local');assert.equal(result.data.retrieval.items.length,1);
});

test('hosted stylist skips dense search and cloud document embeddings for local preference',async t=>{
 let dependency,searchOptions,upsertOptions;
 const store={list:async()=>[],upsert:async(id,doc,options)=>{upsertOptions=options;return{indexing:{mode:'lexical'}};},search:async(id,query,options)=>{searchOptions=options;return{sources:[]};},close(){}};
 const api=setup(t,{knowledgeStore:store,cloud:{authenticate:async()=>owner,documents:async()=>[{id:'note',title:'Preferences',content:'Formal clothes.'}]},services:{style:async(body,deps)=>{dependency=deps;await deps.knowledgeSearch(body.wardrobeId,body.request,{lexicalOnly:false,indexOnRead:true});return{outfits:[]};}}});
 const result=await post(api,'/style',brief);
 assert.equal(result.status,200);assert.equal(dependency.retrievalDependencies.enabled,false);assert.equal(searchOptions.lexicalOnly,true);assert.equal(searchOptions.indexOnRead,false);assert.equal(upsertOptions.lexicalOnly,true);
});

test('hosted explicit OpenAI embedding choice remains eligible for semantic retrieval',async t=>{
 let dependency,searchOptions;
 const api=setup(t,{knowledgeStore:{search:async(id,q,options)=>{searchOptions=options;return{sources:[]};},close(){}},services:{style:async(body,deps)=>{dependency=deps;await deps.knowledgeSearch(body.wardrobeId,body.request,{lexicalOnly:false,indexOnRead:true});return{outfits:[]};}}});
 const result=await post(api,'/style',{...brief,preferences:{embeddingProvider:'openai'}});
 assert.equal(result.status,200);assert.notEqual(dependency.retrievalDependencies.enabled,false);assert.equal(searchOptions.lexicalOnly,false);assert.equal(searchOptions.indexOnRead,true);
});

test('hosted local document search is lexical and reindex gives an actionable response without calling a model',async t=>{
 let searchOptions;
 const api=setup(t,{knowledgeStore:{search:async(id,q,options)=>{searchOptions=options;return{sources:[]};},reindex(){assert.fail('No hosted local reindex');},close(){}}});
 assert.equal((await post(api,'/knowledge/search',{query:'Formal',embeddingProvider:'local'})).status,200);
 assert.equal(searchOptions.lexicalOnly,true);assert.equal(searchOptions.embeddingProvider,'local');
 const response=await post(api,'/knowledge/reindex',{embeddingProvider:'local'});
 assert.equal(response.status,400);assert.equal(response.data.code,'LOCAL_EMBEDDINGS_UNAVAILABLE');
});

test('hosted local photo request remains rejected instead of silently sending it to OpenAI',async t=>{
 const api=setup(t,{services:{recognize(){assert.fail('Never upload without provider choice');}}});
 const response=await post(api,'/recognize',{provider:'local',image:'private-photo'});assert.equal(response.status,400);
});
