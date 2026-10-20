// Bounded live deployment check. Never writes credentials, cookies or participant codes.
import {readFile,writeFile} from 'node:fs/promises';
import {photoCollection,sampleItem} from '../src/wardrobe.js';
import {measureOutfits} from '../src/validation.js';
if(!process.argv.includes('--live'))throw Error('Use --live to verify the deployed pilot with two private test accounts.');
const origin='https://closet-quest-junhao-s7.onrender.com';
const codes=JSON.parse(await readFile('.local-data/deployment/participant-codes.json','utf8'));
const output={measuredAt:new Date().toISOString(),origin,scope:'Hosted smoke test using public sample inputs, not a user study or cold-start benchmark.',checks:[]};
const persist=()=>writeFile('output/sprint7/hosted-smoke.json',JSON.stringify(output,null,2));
async function req(path,{body,cookie,method=body?'POST':'GET'}={}){
 const start=performance.now();const r=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(70000),redirect:'error'});
 const text=await r.text();let value;try{value=JSON.parse(text);}catch{value={};}return {status:r.status,value,cookie:r.headers.get('set-cookie')?.split(';')[0],ms:Math.round(performance.now()-start)};
}
function check(name,passed,details={}){output.checks.push({name,passed,...details});console.log(JSON.stringify(output.checks.at(-1)));}
let own;
try{
 const health=await req('/healthz');check('HTTPS health',health.status===200,{status:health.status,ms:health.ms});
 const blocked=await req('/api/status');check('Unauthenticated API rejected',blocked.status===401,{status:blocked.status});
 const logins=await Promise.all(['p05','p06'].map(async id=>{const user=codes.find(c=>c.id===id);const login=await req('/api/session/login',{body:{code:user.code}});if(login.status!==200||!login.cookie)throw Error('Test account login failed');return login;}));
 own=logins[0];const other=logins[1];check('Private participant sign-in',logins.every(r=>r.value.user?.namespace),{accounts:2});
 const status=await req('/api/status',{cookie:own.cookie});check('Authenticated status',status.status===200,{status:status.status});
 const doc=await req('/api/knowledge/documents',{cookie:own.cookie,body:{title:'Hosted smoke-test note',source:'Public fictional verification fixture',content:'For this fictional campus example, prefer the forest sweater and sand trousers with white canvas sneakers.',embeddingProvider:'openai',wardrobeId:other.value.user.namespace}});
 const ownList=await req('/api/knowledge/list',{cookie:own.cookie,body:{}}),otherList=await req('/api/knowledge/list',{cookie:other.cookie,body:{wardrobeId:own.value.user.namespace}});
 const id=doc.value.document?.id;check('Document identity overrides forged namespace',doc.status===200&&Boolean(id)&&ownList.value.documents?.some(d=>d.id===id)&&!otherList.value.documents?.some(d=>d.id===id),{createStatus:doc.status,indexMode:doc.value.indexing?.mode});
 const image=`data:image/jpeg;base64,${(await readFile('public/photos/tee.jpg')).toString('base64')}`;
 const created=await req('/api/jobs',{cookie:own.cookie,body:{image,provider:'openai',modelProfile:'fast',detectionMode:'multiple',wardrobeId:other.value.user.namespace}});
 const jobId=created.value.id;if(!jobId)throw Error('Hosted photo job was not accepted');
 const forbidden=await req(`/api/jobs/${jobId}`,{cookie:other.cookie});check('Cross-account photo job hidden',forbidden.status===404,{status:forbidden.status});
 const begin=performance.now();let job;
 for(let attempt=0;attempt<30;attempt++){job=await req(`/api/jobs/${jobId}`,{cookie:own.cookie});if(['ready','failed','cancelled'].includes(job.value.status))break;await new Promise(r=>setTimeout(r,1000));}
 check('Live public-photo recognition job',job.value.status==='ready',{status:job.value.status,model:job.value.result?.model,categories:job.value.result?.garments?.map(g=>g.category),elapsedMs:Math.round(performance.now()-begin),errorCode:job.value.error?.code});
 const items=photoCollection.map(sampleItem),style=await req('/api/style',{cookie:own.cookie,body:{items,provider:'openai',studyCondition:'full',context:'Campus casual',request:'An easy campus outfit using my own reviewed clothes.',preferences:{modelProfile:'fast',embeddingProvider:'openai',styles:['Casual']},wardrobeId:other.value.user.namespace}});
 const checks=measureOutfits(style.value.data?.outfits||[],items);check('Live hosted RAG recommendation',style.status===200&&style.value.pipeline?.provider==='openai'&&checks.length>0&&checks.every(c=>c.valid),{status:style.status,provider:style.value.pipeline?.provider,model:style.value.model,outfits:checks.length,validOutfits:checks.filter(c=>c.valid).length,modelFallback:style.value.pipeline?.fallback,knowledgeMode:style.value.pipeline?.knowledgeMode,elapsedMs:style.ms});
 if(id){const removed=await req('/api/knowledge/delete',{cookie:own.cookie,body:{id}});check('Temporary test note removed',removed.status===200);}
 for(const login of logins)await req('/api/session/logout',{cookie:login.cookie,body:{}});
}catch(error){output.error=String(error.message).slice(0,200);console.error(output.error);process.exitCode=1;}
finally{output.passed=output.checks.length>=8&&output.checks.every(c=>c.passed)&&!output.error;await persist();if(!output.passed)process.exitCode=1;}
