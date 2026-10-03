import { fileURLToPath } from 'node:url';
import './env.js';
import { recognizeWithProvider as recognize } from './recognition-provider.js';
import { createKnowledgeStore } from './knowledge.js';
import { recommend as style, resolveProvider } from './recommendation.js';
import { openAIStatus, createOpenAIEmbeddingClient } from './openai.js';
import { createDepopClient, depopStatus } from './depop.js';
import { createJobQueue } from './jobs.js';
import { PIPELINE_VERSION } from './recognition.js';
import { retrieveWardrobeHybrid } from './hybrid-retrieval.js';
import { recordLearningEvent, getLearningStatus, exportLearningData } from './learning.js';
import { modelFor } from './model-config.js';
import { analyzeInspiration } from './inspiration.js';
import { personalizeRequest, applyPreferenceScores } from './personalization.js';
import { retrievalDependenciesFor } from './retrieval-provider.js';

async function listModels() {
  const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error('Model discovery is unavailable.');
  return response.json();
}
async function readJson(req,maxBytes) {
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw Object.assign(new Error('Expected JSON.'),{status:400});
  if(Number(req.headers['content-length'])>maxBytes){req.resume();throw Object.assign(new Error('Request too large.'),{status:413});}
  const buffer=await new Promise((resolve,reject)=>{
    const chunks=[];let bytes=0,settled=false;
    const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('error',error);req.off('aborted',aborted);};
    const finish=(failure,value)=>{if(settled)return;settled=true;cleanup();failure?reject(failure):resolve(value);};
    const data=chunk=>{bytes+=chunk.length;if(bytes>maxBytes){finish(Object.assign(new Error('Request too large.'),{status:413}));req.resume();return;}chunks.push(chunk);};
    const end=()=>finish(null,Buffer.concat(chunks));
    const error=failure=>finish(failure);
    const aborted=()=>finish(Object.assign(new Error('Request interrupted.'),{status:400}));
    req.on('data',data);req.once('end',end);req.once('error',error);req.once('aborted',aborted);
  });
  let body;try{body=JSON.parse(buffer.toString());}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}
  if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(new Error('Expected a JSON object.'),{status:400});
  return body;
}

export function createApi({storageDir=process.env.CLOSET_JOB_DIR||fileURLToPath(new URL('../.local-data/jobs/',import.meta.url)),services={},queueOptions={},knowledgeStore,knowledgeDir=fileURLToPath(new URL('../.local-data/knowledge/',import.meta.url))}={}) {
  const handlers={recognize,analyzeInspiration,style,retrieveWardrobeHybrid,recordLearningEvent,getLearningStatus,exportLearningData,listModels,...services};
  const queue=createJobQueue(handlers.recognize,{...queueOptions,storageDir});
  let knowledge=knowledgeStore;
  const getKnowledge=()=>knowledge||(knowledge=createKnowledgeStore({storageDir:knowledgeDir,embeddingClients:{openai:createOpenAIEmbeddingClient()}}));
  const controllers=new Set();let active=false,closed=false,remoteActive=0;
  async function middleware(req,res) {
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    let claimed=false,remoteClaimed=false,abortDisconnected,controller;
    try {
      if(closed)throw Object.assign(new Error('The local API is stopping. Retry after it restarts.'),{status:503,code:'SERVICE_CLOSED'});
      const route=(req.url||'/').split('?')[0];
      const host=req.headers.host||'';
      if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host)||(req.headers.origin&&req.headers.origin!==`http://${host}`)){res.statusCode=403;return res.end(JSON.stringify({error:'Local same-origin access only.'}));}
      if(req.method==='GET'&&route==='/status'){
        const models={recognition:modelFor('recognition'),stylist:modelFor('stylist'),embedding:modelFor('embedding')};
        try {
          const data=await handlers.listModels();
          const installed=name=>data.models?.some(m=>m.name===name);
          return res.end(JSON.stringify({model:models.recognition,models,openai:openAIStatus(),depop:depopStatus(),recommendationReady:true,pipelineVersion:PIPELINE_VERSION,ready:installed(models.recognition)&&installed(models.stylist),localRecognitionReady:installed(models.recognition),recognitionReady:installed(models.recognition)||openAIStatus().configured,stylistReady:installed(models.stylist),embeddingReady:installed(models.embedding),busy:active||queue.busy,durableJobs:true}));
        }catch{return res.end(JSON.stringify({model:models.recognition,models,openai:openAIStatus(),depop:depopStatus(),recommendationReady:true,pipelineVersion:PIPELINE_VERSION,ready:false,localRecognitionReady:false,recognitionReady:openAIStatus().configured,stylistReady:false,embeddingReady:false,busy:active||queue.busy,durableJobs:true}));}
      }
      if(req.method==='GET'&&['/depop/shop','/depop/products'].includes(route)) {
        controller=new AbortController();controllers.add(controller);abortDisconnected=()=>{if(!res.writableEnded)controller.abort();};res.once('close',abortDisconnected);
        const client=createDepopClient();
        return res.end(JSON.stringify(await(route==='/depop/shop'?client.shop(controller.signal):client.products(new URL(req.url,'http://localhost').searchParams.get('cursor')||'',controller.signal))));
      }
      if(req.method==='GET'&&route==='/learning/status')return res.end(JSON.stringify(await handlers.getLearningStatus()));
      if(req.method==='GET'&&route==='/learning/export')return res.end(JSON.stringify(await handlers.exportLearningData()));
      const jobMatch=route.match(/^\/jobs\/([\w-]+)$/);
      if(jobMatch&&req.method==='GET'){const job=queue.get(jobMatch[1]);res.statusCode=job?200:404;return res.end(JSON.stringify(job||{error:'Analysis expired. Retry this photo.'}));}
      if(jobMatch&&req.method==='DELETE'){res.statusCode=queue.cancel(jobMatch[1])?200:404;return res.end('{}');}
      if(req.method!=='POST'||!['/jobs','/recognize','/inspiration','/style','/retrieve','/learning/events','/knowledge/list','/knowledge/documents','/knowledge/delete','/knowledge/search','/knowledge/reindex'].includes(route)){res.statusCode=404;return res.end('{}');}
      const body=await readJson(req,route==='/learning/events'||route.startsWith('/knowledge/')?128000:8500000);
      const localStyle=route==='/style'&&resolveProvider(body.provider)==='local';
      const cloudPhoto=['/jobs','/recognize'].includes(route)&&body.provider==='openai';
      const inference=(['/jobs','/recognize','/inspiration'].includes(route)&&!cloudPhoto)||localStyle;
      if(inference&&(active||(route!=='/jobs'&&(queue.localBusy??queue.busy)))){res.statusCode=429;return res.end(JSON.stringify({error:'The model is busy. Wait for the current analysis to finish, then retry.'}));}
      if(inference){active=true;claimed=true;}
      if((route==='/style'&&!localStyle)||(route==='/recognize'&&cloudPhoto)){if(remoteActive>=2)throw Object.assign(new Error('Two direct cloud requests are already running. Try again shortly.'),{status:429,code:'CLOUD_BUSY'});remoteActive++;remoteClaimed=true;}
      if(route==='/learning/events'){res.statusCode=201;return res.end(JSON.stringify(await handlers.recordLearningEvent(body)));}
      if(route==='/jobs'){const job=queue.enqueue(body.image,{crop:body.crop,provider:body.provider,modelProfile:body.modelProfile,wardrobeId:body.wardrobeId});res.statusCode=202;return res.end(JSON.stringify(job));}
      controller=new AbortController();controllers.add(controller);abortDisconnected=()=>{if(!res.writableEnded)controller.abort();};res.once('close',abortDisconnected);
      if(route.startsWith('/knowledge/')) {
        const store=getKnowledge();let result;
        if(route==='/knowledge/list')result={documents:await store.list(body.wardrobeId)};
        if(route==='/knowledge/documents')result=await store.upsert(body.wardrobeId,body,{signal:controller.signal,embeddingProvider:body.embeddingProvider||'local'});
        if(route==='/knowledge/delete')result=await store.remove(body.wardrobeId,body.id);
        if(route==='/knowledge/reindex')result=await store.reindex(body.wardrobeId,{signal:controller.signal,embeddingProvider:body.embeddingProvider||'local'});
        if(route==='/knowledge/search')result=await store.search(body.wardrobeId,body.query,{signal:controller.signal,limit:4,lexicalOnly:body.lexicalOnly===true,embeddingProvider:body.embeddingProvider||'local'});
        return res.end(JSON.stringify(result||{ok:true}));
      }
      if(route==='/retrieve'){
        const personal=personalizeRequest(body);
        const request=[personal.request,personal.preferenceSummary].filter(Boolean).join(' ').slice(0,2000);
        const prepared=await handlers.retrieveWardrobeHybrid(personal.items,{...personal,request,signal:controller.signal},{timeoutMs:6000,...retrievalDependenciesFor({provider:body.provider,embeddingProvider:personal.preferences.embeddingProvider,wardrobeId:body.wardrobeId})});
        const {retrieval}=applyPreferenceScores(prepared,personal);
        return res.end(JSON.stringify({retrieval}));
      }
      if(route==='/inspiration')return res.end(JSON.stringify(await handlers.analyzeInspiration(body.image,{signal:controller.signal})));
      res.end(JSON.stringify(await(route==='/recognize'?handlers.recognize(body.image,{crop:body.crop,provider:body.provider,modelProfile:body.modelProfile,wardrobeId:body.wardrobeId,signal:controller.signal}):handlers.style(body,{signal:controller.signal,knowledgeSearch:(...args)=>getKnowledge().search(...args)}))));
    }catch(error){if(!res.destroyed){res.statusCode=error.status||503;res.end(JSON.stringify({error:error.message,code:error.code,retryable:error.retryable===true}));}}
    finally{if(abortDisconnected)res.off('close',abortDisconnected);if(controller)controllers.delete(controller);if(claimed)active=false;if(remoteClaimed)remoteActive--;}
  }
  return {middleware,close:()=>{closed=true;for(const controller of controllers)controller.abort();queue.close();knowledge?.close();},queue};
}
