// Deterministic paired engineering experiment; no evidence of human preference quality.
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
process.env.CLOSET_SKIP_ENV='1';
for(const key of Object.keys(process.env))if(/^(OPENAI_|CLOSET_|SUPABASE_|AWS_)/.test(key)&&key!=='CLOSET_SKIP_ENV')delete process.env[key];
// Enables auto routing only; all model/embedding/network work is substituted below.
process.env.OPENAI_API_KEY='synthetic-never-sent';
globalThis.fetch=async()=>{throw Error('Network prohibited in NFR experiment');};
const {recommend,quickChat}=await import('../server/recommendation.js');
const {retrieveWardrobeHybrid}=await import('../server/hybrid-retrieval.js');
const lexical=(i,o)=>retrieveWardrobeHybrid(i,o,{enabled:false});
const items=[['top','Top'],['bottom','Bottom'],['shoes','Shoes'],['coat','Outerwear']].map(([id,category])=>({id,category,name:id,color:'#888888',wears:0}));
const briefs=['Style me','Give me an outfit','Suggest an outfit','What should I wear?','Create a balanced outfit for my plans.','','A formal wedding this weekend','Business presentation with a jacket','Coffee with friends, relaxed layers','A wedding, but my closet is casual','Keep it comfortable for a museum','Cold evening with layers'];
const base={items,context:'Campus casual',preferences:{modelProfile:'fast'}};
const rows=[];
for(let repeat=0;repeat<3;repeat++)for(const [id,request] of briefs.entries())for(const mode of (repeat%2?['routed','always-model']:['always-model','routed'])){
  let modelCalls=0;
  const start=performance.now();const r=await recommend({...base,request,provider:mode==='routed'?'auto':'openai'},{retrieve:lexical,openaiChat:async(...args)=>{modelCalls++;await delay(40);return quickChat(...args);}});
  rows.push({id,repeat,mode,elapsedMs:+(performance.now()-start).toFixed(2),modelCalls,route:r.pipeline.orchestration.reason,outfits:r.data.outfits.length,owned:r.data.outfits.every(o=>o.itemIds.every(id=>items.some(i=>i.id===id))),fallback:Boolean(r.pipeline.fallback)});
}
const faults=[];
for(const [name,chat] of [['provider-error',async()=>{throw Error('injected');}],['invalid-plan',async()=>({data:{outfits:[{planId:'foreign'}]}})],['abstention',async()=>({data:{outfits:[],reason:'none'}})],['timeout',()=>new Promise(()=>{})]]){
  let calls=0;const r=await recommend({...base,request:'A formal wedding',provider:'openai'},{retrieve:lexical,budgets:{generationMs:10},openaiChat:(...a)=>{calls++;return chat(...a);}});
  faults.push({name,calls,fallback:r.pipeline.fallback?.code,owned:r.data.outfits.every(o=>o.itemIds.every(id=>items.some(i=>i.id===id))),outfits:r.data.outfits.length});
}
const p=(a,q)=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*q)-1];
const summary=Object.fromEntries(['always-model','routed'].map(mode=>{const r=rows.filter(x=>x.mode===mode);return [mode,{requests:r.length,completed:r.filter(x=>x.outfits>0).length,ownedOnly:r.filter(x=>x.owned).length,modelCalls:r.reduce((n,x)=>n+x.modelCalls,0),medianMs:p(r.map(x=>x.elapsedMs),.5),p95Ms:p(r.map(x=>x.elapsedMs),.95)}];}));
mkdirSync('output/sprint9',{recursive:true});
const result={measuredAt:new Date().toISOString(),kind:'paired local fixture experiment; 12 synthetic briefs repeated 3 times per route; mocked generation 40ms; no model quality or human ratings',paidCalls:0,summary,faults,rows};
writeFileSync('output/sprint9/stylist-nfr.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({summary,faults},null,2));
if(rows.some(r=>!r.owned||!r.outfits)||faults.some(r=>!r.owned||!r.outfits||!r.fallback||r.calls!==1))process.exitCode=1;
