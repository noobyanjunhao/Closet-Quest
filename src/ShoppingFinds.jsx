import React,{useEffect,useRef,useState} from 'react';
import {api} from './photos.js';
import './shopping-finds.css';
const cachedFinds=(store,key)=>{const value=store.current.results.get(key);if(value&&Date.now()-Date.parse(value.searchedAt)<24*60*60000)return value;store.current.results.delete(key);return null;};
function ProductPhoto({product}){
 const candidates=[...new Set([product.image,...(product.images||[])].filter(Boolean))], [index,setIndex]=useState(0),[loaded,setLoaded]=useState(false);
 return candidates[index]?<img className={loaded?'is-loaded':''} src={candidates[index]} alt={product.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>{setLoaded(false);setIndex(i=>i+1);}}/>:<span className="shopping-photo-missing"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m16 10 8 5 8-5 10 9-7 7-3-3v17H16V23l-3 3-7-7 10-9Z" stroke="currentColor" strokeWidth="1.5"/></svg><span>See photos at the store ↗</span></span>;
}
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);


export function ShoppingProductCards({products}){return <div className="shopping-products">{products.map((product,index)=><a key={product.url} href={product.url} target="_blank" rel="noopener noreferrer" className="shopping-product"><div className="shopping-product-image"><ProductPhoto key={JSON.stringify([product.image,product.images])} product={product}/><span className="shopping-tier">{index===0?'Lowest price':product.tier}</span><span className="shopping-open" aria-hidden="true">↗</span></div><div className="shopping-product-info"><div className="shopping-brand-price"><small>{product.retailer.replace('.com','')}</small><strong>{money(product.price)}</strong></div><h4>{product.title}</h4><p>{product.reason}</p><span className="shopping-store-link">Take a closer look <span>↗</span></span></div></a>)}</div>;}

export default function ShoppingFinds({ideas,occasion,store,onResults}){
 const saved=store.current.preferences||{},[category,setCategory]=useState(()=>['Top','Bottom','Shoes','Outerwear','Dress','Accessory'].includes(saved.category)?saved.category:ideas[0].category),[presentation,setPresentation]=useState(saved.presentation||'any'),[budget,setBudget]=useState(saved.budget||''),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const categories=[...ideas,...Object.entries({Top:'A top or shirt',Bottom:'Trousers or a skirt',Shoes:'Shoes',Outerwear:'A jacket',Dress:'A dress',Accessory:'An accessory'}).filter(([category])=>!ideas.some(i=>i.category===category)).map(([category,title])=>({category,title}))];
 const controller=useRef(null),generation=useRef(0);
 const query={category,occasion:/wedding|formal/i.test(occasion)?'formal':'everyday',presentation,maxPrice:budget?Number(budget):null};
 const key=JSON.stringify(query);
 const sortedProducts=[...(result?.products||[])].sort((a,b)=>a.price-b.price);
 const [photosOnly,setPhotosOnly]=useState(false);
 const visibleProducts=photosOnly?sortedProducts.filter(p=>p.image||p.images?.length):sortedProducts;
 useEffect(()=>{store.current.preferences={category,presentation,budget};generation.current++;controller.current?.abort();setBusy(false);setError('');setResult(cachedFinds(store,key));return()=>{generation.current++;controller.current?.abort();};},[key]);
 async function find(){
  controller.current?.abort();const token=++generation.current;const active=new AbortController();controller.current=active;setBusy(true);setError('');
  try{const next=cachedFinds(store,key)||await api('shopping',query,'POST',{signal:active.signal,timeoutMs:30000});if(token!==generation.current)return;if(next.products.length)store.current.results.set(key,next);store.current.daily?.clear();setResult(next);onResults?.(next);}
  catch(e){if(token===generation.current&&!active.signal.aborted)setError(e.message);}
  finally{if(token===generation.current)setBusy(false);}
 }
 return <section className="shopping-finds" aria-label="Shop missing pieces"><div className="shopping-finds-heading"><span className="studio-kicker">A LITTLE SOMETHING TO FINISH IT</span><h3>Meet your missing piece.</h3><p>Your closet comes first. If you need an extra, explore real finds from budget to investment—or borrow, rent, or add something you already own.</p></div>
  <div className="shopping-controls"><label>Looking for<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(i=><option value={i.category} key={i.category}>{i.title}</option>)}</select></label><label>Browse<select value={presentation} onChange={e=>setPresentation(e.target.value)}><option value="any">All styles</option><option value="menswear">Menswear</option><option value="womenswear">Womenswear</option></select></label><label>Budget<select value={budget} onChange={e=>setBudget(e.target.value)}><option value="">Any price</option><option value="60">Up to $60</option><option value="150">Up to $150</option><option value="300">Up to $300</option></select></label></div>
  <div className="shopping-search-action"><button className="primary" onClick={find} disabled={busy}>{busy?'Looking through the shops…':'Find a piece ↗'}</button>{busy&&<button onClick={()=>{generation.current++;controller.current?.abort();setBusy(false);}}>Cancel</button>}<small>Saved finds first. A new search runs only if there is no recent match. Prices are previously observed; check the store.</small></div>
  {error&&<p role="alert" className="shopping-search-error">{error}</p>}
  {busy&&<div className="shopping-loading" role="status"><span>Finding pieces worth a look</span><p>Checking shop links, prices and product photos…</p><div className="shopping-skeletons" aria-hidden="true">{[0,1,2].map(i=><div key={i}/>)}</div></div>}
  {result&&<><div className="shopping-results-heading"><div><span className="studio-kicker">THE SHORTLIST</span><h4>{result.products.length?'A little extra. Your kind of price.':'Nothing quite right yet.'}</h4><p role="status">{result.products.length?`${visibleProducts.length} find${visibleProducts.length===1?'':'s'} · Lowest price first`:'Try another style or budget. Your closet outfit is still ready.'}</p></div>{!!result.products.length&&<label className="shopping-photo-filter"><input type="checkbox" checked={photosOnly} onChange={e=>setPhotosOnly(e.target.checked)}/> With photos</label>}</div>
   <ShoppingProductCards products={visibleProducts}/>
   {photosOnly&&sortedProducts.length>0&&visibleProducts.length===0&&<p className="shopping-result-meta">These stores did not share a preview. Turn off “With photos” to see their links and prices.</p>}
   <details className="shopping-details"><summary>About these finds & prices</summary><p className="shopping-result-meta">{result.notice} Last checked {new Date(result.searchedAt).toLocaleString()}. {result.cached&&'Reused from your product library.'} Product photos load from external hosts; preview availability can vary.</p></details></>}

 </section>;
}
