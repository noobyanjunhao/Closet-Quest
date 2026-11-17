// Explicit, bounded live-provider smoke test using public sample inputs only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
if(!process.argv.includes('--live'))throw Error('Requires --live and approval for up to $5 of existing OpenAI usage.');
await import('../server/env.js');
const realFetch=globalThis.fetch,usage=[];let calls=0;
globalThis.fetch=async(url,options={})=>{
 if(String(url).startsWith('https://api.openai.com/')){
  if(++calls>4)throw Error('Live test call limit reached.');
  const body=JSON.parse(options.body||'{}');
  if(!['gpt-6-luna','gpt-6.1-sol'].includes(body.model)||body.max_output_tokens>4096)throw Error('Test model/token budget rejected.');
  if(body.tools){body.max_tool_calls=2;options={...options,body:JSON.stringify(body)};}
  const r=await realFetch(url,options);let data;try{data=await r.clone().json();}catch{}
  usage.push({model:body.model,status:r.status,usage:data?.usage||null,toolCalls:data?.output?.filter(o=>o.type==='web_search_call').length||0});return r;
 }
 if(!String(url).startsWith('https://'))throw Error('Local inference is not part of this live test.');
 return realFetch(url,options);
};
const {recommend}=await import('../server/recommendation.js');
const {recognizeWithProvider}=await import('../server/recognition-provider.js');
const {retrieveWardrobeHybrid}=await import('../server/hybrid-retrieval.js');
const {searchShopping}=await import('../server/shopping.js');
const {photoCollection,sampleItem}=await import('../src/wardrobe.js');
const items=photoCollection.map(sampleItem),checks=[];
const run=async(name,fn)=>{const start=performance.now();try{checks.push({name,...await fn(),elapsedMs:Math.round(performance.now()-start)});}catch(e){checks.push({name,passed:false,code:e.code||e.name,elapsedMs:Math.round(performance.now()-start)});}console.log(JSON.stringify(checks.at(-1)));};
await run('multi-piece recognition, public tee photo',async()=>{
 const image='data:image/jpeg;base64,'+(await readFile('public/photos/tee.jpg')).toString('base64');
 const r=await recognizeWithProvider(image,{provider:'openai',modelProfile:'fast',detectionMode:'multiple'});
 return {passed:Boolean(r.garments?.some(g=>g.category==='Top')),model:r.model,garments:r.garments,data:r.data};
});
for(const profile of ['fast','balanced'])await run('wedding styling '+profile,async()=>{
 const r=await recommend({items,provider:'openai',request:'I am a wedding guest. Give me something formal from these clothes and explain what is missing.',context:'Campus casual',preferences:{modelProfile:profile}},{retrieve:(i,o)=>retrieveWardrobeHybrid(i,o,{enabled:false})});
 return {passed:r.pipeline.provider==='openai'&&r.data.outfits.length>0&&r.data.outfits.every(o=>o.itemIds.every(id=>items.some(i=>i.id===id))),model:r.model,provider:r.pipeline.provider,fallback:r.pipeline.fallback,outfits:r.data.outfits.map(o=>({title:o.title,explanation:o.explanation,itemIds:o.itemIds,missingCategories:o.missingCategories}))};
});
await run('live formal shoes search',async()=>{const r=await searchShopping({category:'Shoes',occasion:'formal',presentation:'any',maxPrice:150});return {passed:r.products.length>0,products:r.products.map(({title,url,price,image})=>({title,url,price,hasImage:Boolean(image)})),notice:r.notice};});
await mkdir('output/sprint9',{recursive:true});
await writeFile('output/sprint9/live-capabilities.json',JSON.stringify({measuredAt:new Date().toISOString(),scope:'Live OpenAI calls through application modules on public sample data; not hosted/authenticated or human acceptance testing',authorization:'Up to $5, at most four calls; two web-search tool calls; bounded tokens; only Luna/Sol. No automatic retries.',checks,usage},null,2)+'\n');
