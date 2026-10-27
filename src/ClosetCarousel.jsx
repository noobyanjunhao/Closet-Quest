import React,{useRef} from 'react';
import {Garment} from './components.jsx';
import './closet-carousel.css';

export function ringOffset(index,selected,length){let d=(index-selected+length)%length;if(d>length/2)d-=length;return d;}
export default function ClosetCarousel({items,selectedId,onSelect,onEdit,onStyle}){
 const drag=useRef(null),swiped=useRef(false),strip=useRef(null);
 if(!items.length)return null;
 const selected=Math.max(0,items.findIndex(i=>i.id===selectedId)),item=items[selected];
 const move=delta=>onSelect(items[(selected+delta+items.length)%items.length].id);
 return <section className="closet-carousel" aria-label="Your rotating closet" aria-roledescription="carousel">
  <div className="closet-carousel-heading"><div><span className="eyebrow">THE DAILY ROTATION</span><h2>Good pieces. Endless possibilities.</h2></div><span className="closet-count">{String(selected+1).padStart(2,'0')} <span>/ {String(items.length).padStart(2,'0')}</span></span></div>
  <div className="closet-orbit" tabIndex={0} aria-label="Browse clothes. Use left and right arrow keys or swipe." onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='Home')onSelect(items[0].id);else if(e.key==='End')onSelect(items.at(-1).id);else move(e.key==='ArrowRight'?1:-1);}}}
   onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY};swiped.current=false;}}
   onPointerUp={e=>{const p=drag.current;drag.current=null;if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){swiped.current=true;move(dx<0?1:-1);}}} onPointerCancel={()=>{drag.current=null;}}>
   <div className="closet-hanging-rail" aria-hidden="true"/><div className="closet-orbit-floor" aria-hidden="true"/>
   {items.map((piece,index)=>{const offset=ringOffset(index,selected,items.length);if(Math.abs(offset)>3)return null;return <button key={piece.id} type="button" className={`closet-orbit-piece ${offset===0?'is-selected':''}`} tabIndex={offset===0?0:-1} aria-label={`${piece.name}${offset===0?', selected':''}`} aria-pressed={offset===0} style={{'--offset':offset,'--distance':Math.abs(offset),zIndex:10-Math.abs(offset)}} onClick={()=>{if(swiped.current){swiped.current=false;return;}onSelect(piece.id);}}>
    <span className="closet-hanger" aria-hidden="true"/><span className="closet-piece-surface"><Garment item={piece} loading={Math.abs(offset)<2?'eager':'lazy'}/></span><span className="closet-piece-label">{piece.category}</span>
   </button>;})}
   <button className="closet-arrow previous" aria-label="Previous piece" disabled={items.length<2} onClick={()=>move(-1)}>←</button><button className="closet-arrow next" aria-label="Next piece" disabled={items.length<2} onClick={()=>move(1)}>→</button>
  </div>
  <div className="closet-selected-detail"><div aria-live="polite" aria-atomic="true"><span className="eyebrow">{item.cutoutImage?'YOUR CUTOUT':item.image?'YOUR PHOTO':'YOUR PIECE'} · {item.needsReview?'NEEDS REVIEW':`${item.wears||0} WEARS`}</span><h3>{item.name}</h3><p>{[item.colorName,item.itemType||item.category].filter(Boolean).join(' · ')}</p></div><div className="closet-selected-actions"><button onClick={()=>onEdit(item)}>Details & cutout ↗</button><button className="primary" disabled={item.needsReview} onClick={()=>onStyle(item)}>Style this piece ✧</button></div></div>
  <div ref={strip} className="closet-album-strip" aria-label="Choose a garment">{items.map(piece=><button key={piece.id} aria-label={`Select ${piece.name}`} aria-pressed={piece.id===item.id} onClick={e=>{onSelect(piece.id);e.currentTarget.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}}><Garment item={piece}/><span>{piece.name}</span></button>)}</div>
  <p className="closet-gesture-hint">Swipe through your clothes · Pick a piece to build around</p>
 </section>;
}
