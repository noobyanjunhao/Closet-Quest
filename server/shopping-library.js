import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {shoppingQuery,publicHttps,RETAILERS} from './shopping.js';

export const SHOPPING_FRESH_MS=24*60*60*1000, SHOPPING_MAX_AGE_MS=14*SHOPPING_FRESH_MS;
const categories=['Top','Bottom','Shoes','Dress','Outerwear','Accessory'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const key=q=>hash(JSON.stringify(shoppingQuery(q)));
const dayAt=now=>new Date(now).toISOString().slice(0,10);
const notice='Saved shop finds, not clothes you own. Prices and photos were observed on the checked date; confirm current price, color, size and stock at the store. Limited retailer selection. No affiliate ranking.';
export function validateLibraryEntry(entry,now=Date.now()){
 try{
  const query=shoppingQuery(entry?.query),at=Date.parse(entry.searchedAt);
  if(!Number.isFinite(at)||at>now+60000||now-at>SHOPPING_MAX_AGE_MS)return null;
  const products=(Array.isArray(entry.products)?entry.products:[]).slice(0,6).flatMap(p=>{
   const url=publicHttps(p.url,RETAILERS);if(!url||typeof p.title!=='string'||!p.title.trim()||p.title.length>160||!Number.isFinite(p.price)||p.price<=0||p.price>10000||p.currency!=='USD')return [];
   const images=[...new Set([p.image,...(Array.isArray(p.images)?p.images:[])].map(x=>publicHttps(x)).filter(Boolean))].slice(0,4);
   const path=new URL(url).pathname,presentation=query.presentation==='any'?(/\/womens\//.test(path)?'womenswear':/\/mens\//.test(path)?'menswear':'any'):query.presentation;
   return [{title:p.title,url,price:p.price,currency:'USD',retailer:new URL(url).hostname.replace(/^www\./,''),image:images[0]||null,images,tier:p.price<60?'Budget':p.price<150?'Mid-range':'Investment',owned:false,category:query.category,presentation,occasion:query.occasion,checkedAt:new Date(at).toISOString(),reason:`A ${query.category.toLowerCase()} to consider for a ${query.occasion==='formal'?'dressier':'relaxed'} look.`,priceStatus:'Previously observed price; confirm at store'}];
  });
  return products.length?{query,products,searchedAt:new Date(at).toISOString()}:null;
 }catch{return null;}
}
function waitFor(promise,signal){
 if(!signal)return promise;signal.throwIfAborted();
 return new Promise((resolve,reject)=>{const aborted=()=>{cleanup();reject(signal.reason);},cleanup=()=>signal.removeEventListener('abort',aborted);signal.addEventListener('abort',aborted,{once:true});promise.then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});});
}
export function createShoppingLibrary({search,cloud,seed,storageDir,now=Date.now}={}){
 if(seed===undefined)try{seed=JSON.parse(readFileSync(new URL('../data/shopping-library.json',import.meta.url),'utf8')).entries;}catch{seed=[];}
 const shared=new Map(),personal=new Map(),pending=new Map();
 const put=(map,entry)=>{const clean=validateLibraryEntry(entry,now());if(clean){map.set(key(clean.query),clean);while(map.size>120)map.delete(map.keys().next().value);}return clean;};
 for(const entry of seed||[])put(shared,entry);
 if(storageDir)try{for(const entry of JSON.parse(readFileSync(join(storageDir,'library.json'),'utf8')))put(shared,entry);}catch{}
 function persist(){if(!storageDir)return;try{mkdirSync(storageDir,{recursive:true});const path=join(storageDir,'library.json');writeFileSync(path+'.tmp',JSON.stringify([...shared.values()]));renameSync(path+'.tmp',path);}catch{/* Cloud persistence is independent of the local optimization. */}}
 async function entriesFor(user){
  const id=user?.namespace||'local';let owned=personal.get(id);
  if(user?.cloud&&cloud?.shoppingLibrary&&(!owned||now()-owned.loadedAt>60000)){
   if(!owned){owned={map:new Map(),loadedAt:0};personal.set(id,owned);}
   if(!owned.loading)owned.loading=(async()=>{try{const rows=await cloud.shoppingLibrary(user);const map=new Map();for(const row of rows||[])put(map,row.result);owned.map=map;owned.loadedAt=now();}catch{owned.loadedAt=now();owned.unavailable=true;}finally{owned.loading=null;}})();
   await owned.loading;
  }
  if(personal.size>100)personal.delete(personal.keys().next().value);
  // Account-controlled records never enter the shared catalog.
  return [...shared.values(),...(owned?.map.values()||[])].map(e=>validateLibraryEntry(e,now())).filter(Boolean);
 }
 const compatible=(entry,q)=>entry.query.category===q.category&&entry.query.occasion===q.occasion&&(entry.query.presentation===q.presentation||q.presentation==='any');
 function selection(entries,q,freshOnly){const products=new Map();for(const entry of entries.filter(e=>compatible(e,q)&&(!freshOnly||now()-Date.parse(e.searchedAt)<SHOPPING_FRESH_MS)).sort((a,b)=>Date.parse(b.searchedAt)-Date.parse(a.searchedAt))){for(const p of entry.products)if((q.maxPrice===null||p.price<=q.maxPrice)&&!products.has(p.url))products.set(p.url,p);}return [...products.values()].sort((a,b)=>a.price-b.price).slice(0,6);}
 function result(products,query,source,extra={}){return {products,query,searchedAt:products.length?products.map(p=>p.checkedAt).sort()[0]:new Date(now()).toISOString(),cached:source!=='live',source,notice,liveSearchUsed:source==='live',...extra};}
 async function saveFor(user,entry){
  if(!user?.cloud||!cloud?.saveShoppingResult)return;
  const previous=personal.get(user.namespace)?.map.get(key(entry.query));if(previous&&previous.searchedAt===entry.searchedAt&&JSON.stringify(previous.products)===JSON.stringify(entry.products))return;
  try{await cloud.saveShoppingResult(user,key(entry.query),entry);let owned=personal.get(user.namespace);if(!owned){owned={map:new Map(),loadedAt:now()};personal.set(user.namespace,owned);}put(owned.map,entry);}catch{/* Show results even if private library sync temporarily fails. */}
 }
 return {
  async browse(input={}, {user}={}){
   const category=input.category||'All',presentation=input.presentation||'any';
   if(!['All',...categories].includes(category)||!['any','menswear','womenswear'].includes(presentation))throw Object.assign(Error('Choose a clothing category and style.'),{status:400});
   const budget=input.maxPrice==null?null:Number(input.maxPrice);if(budget!==null&&(!Number.isFinite(budget)||budget<1||budget>5000))throw Object.assign(Error('Choose a valid budget.'),{status:400});
   const unique=new Map();for(const e of (await entriesFor(user)).sort((a,b)=>Date.parse(b.searchedAt)-Date.parse(a.searchedAt)))for(const p of e.products){if(category!=='All'&&p.category!==category||presentation!=='any'&&p.presentation!==presentation&&p.presentation!=='any'||budget!==null&&p.price>budget)continue;if(!unique.has(p.url))unique.set(p.url,p);}
   const day=dayAt(now()),all=[...unique.values()],daily=input.mode!=='library';
   const chosen=(daily?[...all].sort((a,b)=>hash(day+a.url).localeCompare(hash(day+b.url))).slice(0,4):all.slice(0,60)).sort((a,b)=>a.price-b.price);
   return result(chosen,{category,presentation,maxPrice:budget},'library',{day,libraryCount:all.length,daily,stale:chosen.some(p=>now()-Date.parse(p.checkedAt)>=SHOPPING_FRESH_MS)});
  },
  async find(input,{user,signal,beforeSearch}={}){
   const q=shoppingQuery(input),entries=await entriesFor(user),fresh=selection(entries,q,true);
   if(fresh.length){const cached=result(fresh,q,'library');await saveFor(user,{query:q,products:fresh,searchedAt:cached.searchedAt});return cached;}
   const id=key(q);if(!pending.has(id)){
    beforeSearch?.();
    const task=Promise.resolve().then(()=>search(q,{scope:'public-product-library'})).then(raw=>{const clean=put(shared,raw);if(!clean)throw Object.assign(Error('No reliable new shop results. Try another category.'),{status:503});persist();return clean;}).finally(()=>pending.delete(id));pending.set(id,task);
   }
   try{const entry=await waitFor(pending.get(id),signal);await saveFor(user,entry);return result(entry.products,q,'live');}
   catch(e){if(signal?.aborted)throw e;const older=selection(entries,q,false);if(older.length)return result(older,q,'saved-fallback',{stale:true,notice:'Live search is unavailable. These are previously saved finds. '+notice});throw e;}
  }
 };
}
