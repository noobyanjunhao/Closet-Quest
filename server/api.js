import { fileURLToPath } from 'node:url';
import { recognize, style } from './agents.js';
import { createJobQueue } from './jobs.js';
import { PIPELINE_VERSION } from './recognition.js';
import { retrieveWardrobeHybrid } from './hybrid-retrieval.js';
import { recordLearningEvent, getLearningStatus, exportLearningData } from './learning.js';
import { modelFor } from './model-config.js';

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

export function createApi({storageDir=process.env.CLOSET_JOB_DIR||fileURLToPath(new URL('../.local-data/jobs/',import.meta.url)),services={},queueOptions={}}={}) {
  const handlers={recognize,style,retrieveWardrobeHybrid,recordLearningEvent,getLearningStatus,exportLearningData,listModels,...services};
  const queue=createJobQueue(handlers.recognize,{...queueOptions,storageDir});
  const controllers=new Set();let active=false,closed=false;
  async function middleware(req,res) {
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    let claimed=false,abortDisconnected,controller;
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
          return res.end(JSON.stringify({model:models.recognition,models,pipelineVersion:PIPELINE_VERSION,ready:installed(models.recognition)&&installed(models.stylist),recognitionReady:installed(models.recognition),stylistReady:installed(models.stylist),embeddingReady:installed(models.embedding),busy:active||queue.busy,durableJobs:true}));
        }catch{return res.end(JSON.stringify({model:models.recognition,models,pipelineVersion:PIPELINE_VERSION,ready:false,recognitionReady:false,stylistReady:false,embeddingReady:false,busy:active||queue.busy,durableJobs:true}));}
      }
      if(req.method==='GET'&&route==='/learning/status')return res.end(JSON.stringify(await handlers.getLearningStatus()));
      if(req.method==='GET'&&route==='/learning/export')return res.end(JSON.stringify(await handlers.exportLearningData()));
      const jobMatch=route.match(/^\/jobs\/([\w-]+)$/);
      if(jobMatch&&req.method==='GET'){const job=queue.get(jobMatch[1]);res.statusCode=job?200:404;return res.end(JSON.stringify(job||{error:'Analysis expired. Retry this photo.'}));}
      if(jobMatch&&req.method==='DELETE'){res.statusCode=queue.cancel(jobMatch[1])?200:404;return res.end('{}');}
      if(req.method!=='POST'||!['/jobs','/recognize','/style','/retrieve','/learning/events'].includes(route)){res.statusCode=404;return res.end('{}');}
      const inference=['/jobs','/recognize','/style'].includes(route);
      if(inference&&(active||(route!=='/jobs'&&queue.busy))){res.statusCode=429;return res.end(JSON.stringify({error:'The model is busy. Wait for the current analysis to finish, then retry.'}));}
      if(inference){active=true;claimed=true;}
      const body=await readJson(req,route==='/learning/events'?128000:8500000);
      if(route==='/learning/events'){res.statusCode=201;return res.end(JSON.stringify(await handlers.recordLearningEvent(body)));}
      if(route==='/jobs'){const job=queue.enqueue(body.image,{crop:body.crop});res.statusCode=202;return res.end(JSON.stringify(job));}
      controller=new AbortController();controllers.add(controller);abortDisconnected=()=>{if(!res.writableEnded)controller.abort();};res.once('close',abortDisconnected);
      if(route==='/retrieve'){const {retrieval}=await handlers.retrieveWardrobeHybrid(body.items,{...body,signal:controller.signal});return res.end(JSON.stringify({retrieval}));}
      res.end(JSON.stringify(await(route==='/recognize'?handlers.recognize(body.image,{crop:body.crop,signal:controller.signal}):handlers.style(body,{signal:controller.signal}))));
    }catch(error){if(!res.destroyed){res.statusCode=error.status||503;res.end(JSON.stringify({error:error.message,code:error.code,retryable:error.retryable===true}));}}
    finally{if(abortDisconnected)res.off('close',abortDisconnected);if(controller)controllers.delete(controller);if(claimed)active=false;}
  }
  return {middleware,close:()=>{closed=true;for(const controller of controllers)controller.abort();queue.close();},queue};
}
