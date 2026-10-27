import React,{useEffect,useRef,useState} from 'react';
import {api} from './photos.js';
import './shopping-finds.css';
const cachedFinds=(store,key)=>{const value=store.current.results.get(key);if(value&&Date.now()-Date.parse(value.searchedAt)<15*60000)return value;store.current.results.delete(key);return null;};
function ProductPhoto({product}){const [failed,setFailed]=useState(false);return product.image&&!failed?<img src={product.image} alt={product.title} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span>Photo unavailable</span>;}

export default function ShoppingFinds({ideas,occasion,store}){
 const saved=store.current.preferences||{},[category,setCategory]=useState(()=>['Top','Bottom','Shoes','Outerwear','Dress','Accessory'].includes(saved.category)?saved.category:ideas[0].category),[presentation,setPresentation]=useState(saved.presentation||'any'),[budget,setBudget]=useState(saved.budget||''),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const categories=[...ideas,...Object.entries({Top:'A top or shirt',Bottom:'Trousers or a skirt',Shoes:'Shoes',Outerwear:'A jacket',Dress:'A dress',Accessory:'An accessory'}).filter(([category])=>!ideas.some(i=>i.category===category)).map(([category,title])=>({category,title}))];
 const controller=useRef(null),generation=useRef(0);
 const query={category,occasion:/wedding|formal/i.test(occasion)?'formal':'everyday',presentation,maxPrice:budget?Number(budget):null};
 const key=JSON.stringify(query);
 useEffect(()=>{store.current.preferences={category,presentation,budget};generation.current++;controller.current?.abort();setBusy(false);setError('');setResult(cachedFinds(store,key));return()=>{generation.current++;controller.current?.abort();};},[key]);
 async function find(){
  controller.current?.abort();const token=++generation.current;const active=new AbortController();controller.current=active;setBusy(true);setError('');
  try{const next=cachedFinds(store,key)||await api('shopping',query,'POST',{signal:active.signal,timeoutMs:30000});if(token!==generation.current)return;if(next.products.length)store.current.results.set(key,next);setResult(next);}
  catch(e){if(token===generation.current&&!active.signal.aborted)setError(e.message);}
  finally{if(token===generation.current)setBusy(false);}
 }
 return <section className="shopping-finds" aria-label="Shop missing pieces"><div className="shopping-finds-heading"><span className="studio-kicker">A LITTLE SOMETHING TO FINISH IT</span><h3>Meet your missing piece.</h3><p>Your closet comes first. If you need an extra, explore real finds from budget to investment—or borrow, rent, or add something you already own.</p></div>
  <div className="shopping-controls"><label>Looking for<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(i=><option value={i.category} key={i.category}>{i.title}</option>)}</select></label><label>Browse<select value={presentation} onChange={e=>setPresentation(e.target.value)}><option value="any">All styles</option><option value="menswear">Menswear</option><option value="womenswear">Womenswear</option></select></label><label>Budget<select value={budget} onChange={e=>setBudget(e.target.value)}><option value="">Any price</option><option value="60">Up to $60</option><option value="150">Up to $150</option><option value="300">Up to $300</option></select></label></div>
  <div className="shopping-search-action"><button className="primary" onClick={find} disabled={busy}>{busy?'Looking through the shops…':'Find online options ↗'}</button>{busy&&<button onClick={()=>{generation.current++;controller.current?.abort();setBusy(false);}}>Cancel</button>}<small>US stores · USD. Search shares only category, occasion, style and budget. Photos and personal notes stay out of shopping queries.</small></div>
  {error&&<p role="alert" className="shopping-search-error">{error}</p>}
  {result&&<><p className="shopping-result-meta" role="status">{result.products.length?`${result.products.length} external finds · Price: low to high`:'No sourced products matched this search. Try another style or budget.'}</p><div className="shopping-products">{result.products.map(product=><a key={product.url} href={product.url} target="_blank" rel="noopener noreferrer" className="shopping-product"><div className="shopping-product-image"><ProductPhoto key={product.image} product={product}/><span className="shopping-tier">{product.tier}</span></div><div className="shopping-product-info"><small>{product.retailer} · NOT IN YOUR CLOSET</small><h4>{product.title}</h4><strong>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(product.price)} <span>↗</span></strong><p>{product.reason}</p><small>Search-reported price · Check store</small></div></a>)}</div><p className="shopping-result-meta">{result.notice} Searched {new Date(result.searchedAt).toLocaleString()}. {result.products.some(p=>p.image)&&'Product photos load from external retailer/image hosts.'}</p></>}
 </section>;
}
