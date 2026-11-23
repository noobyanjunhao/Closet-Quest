import React,{useEffect,useRef,useState} from 'react';
import {api} from './photos.js';
import {initialShoppingCategory} from './shopping-selection.js';
import {retailerSearch} from './shop-brief.js';
import {productReferences} from './shop-picks.js';
import './shopping-finds.css';
const cachedFinds=(store,key)=>{const value=store.current.results.get(key);if(value&&Date.now()-Date.parse(value.searchedAt)<24*60*60000)return value;store.current.results.delete(key);return null;};
function ProductPhoto({product}){
 const candidates=[...new Set([product.image,...(product.images||[])].filter(Boolean))], [index,setIndex]=useState(0),[loaded,setLoaded]=useState(false);
 return candidates[index]?<img className={loaded?'is-loaded':''} src={candidates[index]} alt={product.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>{setLoaded(false);setIndex(i=>i+1);}}/>:<span className="shopping-photo-missing"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 8h36v32H6z M7 34l11-13 8 8 5-5 10 10" stroke="currentColor" strokeWidth="1.5"/></svg><span>See photos at the store ↗</span></span>;
}
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);


export function ShoppingProductCards({products}){return <div className="shopping-products">{products.map((product,index)=><a key={product.url} href={product.url} target="_blank" rel="noopener noreferrer" className="shopping-product"><div className="shopping-product-image"><ProductPhoto key={JSON.stringify([product.image,product.images])} product={product}/>{product.price!=null&&<span className="shopping-tier">{index===0?'Lowest price':product.tier}</span>}<span className="shopping-open" aria-hidden="true">↗</span></div><div className="shopping-product-info"><div className="shopping-brand-price"><small>{product.retailer.replace('.com','')}</small><strong>{product.price==null?'Check price':money(product.price)}</strong></div><h4>{product.title}</h4><p>{product.reason}</p><span className="shopping-store-link">Take a closer look <span>↗</span></span></div></a>)}</div>;}

const shopCategories={All:'All pieces',Top:'Tops',Bottom:'Bottoms',Shoes:'Shoes',Outerwear:'Outerwear',Dress:'Dresses',Accessory:'Accessories'};

export default function ShoppingFinds({ideas=[],occasion='',store,onResults,initialQuery,preview=false,heading='Meet your missing piece.'}){
 const saved=store.current.preferences||{};
 const [category,setCategory]=useState(initialQuery?.category||initialShoppingCategory(ideas,saved.category));
 const [presentation,setPresentation]=useState(initialQuery?.presentation||saved.presentation||'any');
 const [budget,setBudget]=useState(initialQuery?String(initialQuery.maxPrice??''):saved.budget||'');
 const [result,setResult]=useState(null),[phase,setPhase]=useState('idle'),[error,setError]=useState(''),[photosOnly,setPhotosOnly]=useState(false);
 const active=useRef(null);
 const query={category,presentation,maxPrice:budget?Number(budget):null,occasion:initialQuery?.occasion||(/wedding|formal/i.test(occasion)?'formal':'everyday')};
 if(category===initialQuery?.category && initialQuery.kind)query.kind=initialQuery.kind;
 if(initialQuery?.color)query.color=initialQuery.color;
 const key=JSON.stringify(query);
 useEffect(()=>{
  if(!initialQuery)store.current.preferences={category,presentation,budget};
  const controller=new AbortController();
  active.current=controller;
  setError('');setPhotosOnly(false);
  const fresh=cachedFinds(store,key);
  setResult(fresh);setPhase('idle');
  if(preview&&!fresh){
   setPhase('shelf');
   api('shopping/library',{...query,mode:'library'},'POST',{signal:controller.signal,timeoutMs:10000})
    .then(data=>{if(!controller.signal.aborted)setResult(data);})
    .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
    .finally(()=>{if(!controller.signal.aborted)setPhase('idle');});
  }
  return ()=>active.current?.abort();
 },[key,preview]);
 async function find(){
  active.current?.abort();
  const controller=new AbortController();active.current=controller;setPhase('search');setError('');
  try{
   const data=cachedFinds(store,key)||await api('shopping',query,'POST',{signal:controller.signal,timeoutMs:30000});
   if(controller.signal.aborted)return;
   if(data.products.length){store.current.results.set(key,data);store.current.daily?.clear();onResults?.(data);}
   setResult(data);
  }catch(e){if(!controller.signal.aborted)setError(e.message);}
  finally{if(!controller.signal.aborted)setPhase('idle');}
 }
 const priced=[...(result?.products||[])].sort((a,b)=>a.price-b.price);
 const showResults=!!result||!!error||preview&&phase==='idle';
 const products=priced.length?priced:showResults?productReferences(query):[];
 const visible=photosOnly?products.filter(p=>p.image||p.images?.length):products;
 const summary=[query.color,query.kind||shopCategories[category]].filter(Boolean).join(' ');
 const budgets=[...new Set(['60','150','300',budget].filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
 return <section className="shopping-finds" aria-label={heading}>
  <div className="shopping-finds-heading"><span className="studio-kicker">FROM THE SHOPS</span><h3>{heading}</h3>
   <p>{preview?'Shop '+summary.toLowerCase()+(budget?' up to '+money(Number(budget)):'')+'.':'Browse an optional addition to your closet.'} Select a piece to see sizes, stock and the current price at the store.</p></div>
  <div className="shopping-controls">
   <label>Looking for<select value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(shopCategories).filter(([c])=>c!=='All'||initialQuery?.category==='All').map(([c,title])=><option value={c} key={c}>{ideas.find(i=>i.category===c)?.title||title}</option>)}</select></label>
   <label>Browse<select value={presentation} onChange={e=>setPresentation(e.target.value)}><option value="any">All styles</option><option value="menswear">Menswear</option><option value="womenswear">Womenswear</option></select></label>
   <label>Budget<select value={budget} onChange={e=>setBudget(e.target.value)}><option value="">Any price</option>{budgets.map(b=><option key={b} value={b}>Up to ${b}</option>)}</select></label>
  </div>
  {phase==='shelf'&&<p role="status">Checking the saved shop library…</p>}
  {error&&<p role="alert" className="shopping-search-error">{error}</p>}
  {showResults&&<><div className="shopping-results-heading"><div><h4>{priced.length?(result?.relaxed?.length?'Closest saved finds':'Your shortlist'):products.length?'Explore these pieces':'No matching price on file'}</h4>
   <p role="status">{priced.length?(result?.relaxed?.length?'No exact match for that '+result.relaxed.map(f=>f==='kind'?'type':f).join(' and ')+' yet · ':'')+priced.length+' finds · Lowest price first':products.length?'Retailer links · Check prices and availability in store':'Try another filter or check a retailer directly.'}</p></div>
   {products.length>0&&<label className="shopping-photo-filter"><input type="checkbox" checked={photosOnly} onChange={e=>setPhotosOnly(e.target.checked)}/> With photos</label>}</div>
   <ShoppingProductCards products={visible}/>
   {photosOnly&&products.length>0&&!visible.length&&<p>Turn off “With photos” to see the product links.</p>}
   {priced.length>0&&result.searchedAt&&<p className="shopping-result-meta">Prices last checked {new Date(result.searchedAt).toLocaleDateString()}. Confirm your size and price at the store.</p>}
  </>}
  <div className="shopping-search-action">
   {category!=='All'&&<button className="primary" onClick={find} disabled={phase==='search'}>{phase==='search'?'Searching the shops…':preview?'Check for more finds':'Find a piece ↗'}</button>}
   {phase==='search'&&<button onClick={()=>{active.current?.abort();setPhase('idle');}}>Cancel</button>}
   {(showResults||category==='All')&&<a href={retailerSearch(query)} target="_blank" rel="noopener noreferrer">Search at Nordstrom ↗</a>}
   <small>{category==='All'?'Choose a category for a more specific search.':'Recent finds are reused first. A new web search runs only when needed.'}</small>
  </div>
 </section>;
}
