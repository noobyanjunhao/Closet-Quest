import React,{useRef,useState} from 'react';
import {Garment,Modal} from './components.jsx';
import {wornToday} from './wardrobe.js';
import {nextShelfPage,savedShelfPosition} from './closet-navigation.js';

export default function WardrobeRail({state,scrollPosition,onStyle,onWear,onEdit}) {
  const [selected,setSelected]=useState(null),rail=useRef(null);
  const look=state.savedOutfits.find(o=>o.id===selected);
  const pieces=outfit=>outfit.itemIds.map(id=>state.items.find(i=>i.id===id)).filter(Boolean);
  function scrollLooks(){
    const shelf=rail.current;if(!shelf)return;
    const horizontal=getComputedStyle(shelf).flexDirection.startsWith('row');
    const position=horizontal?shelf.scrollLeft:shelf.scrollTop,viewport=horizontal?shelf.clientWidth:shelf.clientHeight,content=horizontal?shelf.scrollWidth:shelf.scrollHeight;
    shelf.scrollTo({[horizontal?'left':'top']:nextShelfPage({position,viewport,content}),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  return <aside className="wardrobe-look-rail" aria-label="Your saved outfit rail">
    <div className="rail-heading"><div><span className="eyebrow">ON REPEAT</span><h2>Your looks <small>{state.savedOutfits.length}</small></h2></div>{state.savedOutfits.length>1&&<button aria-label="Scroll saved outfits" onClick={scrollLooks}><span aria-hidden="true">↓</span></button>}</div>
    <div className="saved-outfit-scroll" tabIndex={state.savedOutfits.length?0:undefined} role="region" aria-label="Scroll your saved outfits" ref={el=>{rail.current=el;if(el){const position=savedShelfPosition(scrollPosition.current);el.scrollTop=position.top;el.scrollLeft=position.left;}}} onScroll={e=>{scrollPosition.current={top:e.currentTarget.scrollTop,left:e.currentTarget.scrollLeft};}}>
      {state.savedOutfits.map(outfit=><button className="rail-look" key={outfit.id} onClick={()=>setSelected(outfit.id)} aria-label={`Open saved outfit ${outfit.title}`}><span className="rail-look-collage">{pieces(outfit).slice(0,4).map(item=><Garment key={item.id} item={item}/>)}</span><span className="rail-look-title">{outfit.title}</span><span className="rail-look-context">{outfit.context}</span></button>)}
      {!state.savedOutfits.length&&<div className="rail-empty"><span>♡</span><p>A place for your favorite combinations.</p><button onClick={onStyle}>Build a look ↗</button></div>}
    </div>
    <button className="rail-new-look" onClick={onStyle}>＋ New look</button>
    {look&&<Modal title={look.title} onClose={()=>setSelected(null)} swipeToClose wide><div className="rail-outfit-detail"><p className="eyebrow">{look.context}</p><div className="rail-detail-pieces">{pieces(look).map(item=><button key={item.id} onClick={()=>{setSelected(null);onEdit(item);}}><Garment item={item}/><span>{item.name}</span></button>)}</div><p>{look.explanation}</p><button className="primary" disabled={!pieces(look).length||wornToday(state,look.itemIds)} onClick={()=>onWear(look)}>{wornToday(state,look.itemIds)?'✓ Worn today':'Wear today'}</button></div></Modal>}
  </aside>;
}
