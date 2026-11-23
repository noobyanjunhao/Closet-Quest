import React,{useEffect,useState} from 'react';
import { detectionCrop } from './photo-import.js';
import './photo-detections.css';

// The reveal plays once per analysis; reopening the same photo shows the settled result.
const revealed=new Set();
const clamp=(n,low,high)=>Math.min(high,Math.max(low,n));
// A little air around each piece, kept inside the photo.
export function paddedCrop(crop,pad=.06){
  const dx=crop.width*pad,dy=crop.height*pad,x=clamp(crop.x-dx,0,1),y=clamp(crop.y-dy,0,1);
  return {x,y,width:clamp(crop.x+crop.width+dx,0,1)-x,height:clamp(crop.y+crop.height+dy,0,1)-y};
}

export default function PhotoDetections({source,result,busy,onReview,revealKey}) {
  const [selected,setSelected]=useState(()=>result.garments.map((_,index)=>index));
  const [active,setActive]=useState(null);
  const [settled]=useState(()=>revealKey!=null&&revealed.has(revealKey));
  const [natural,setNatural]=useState(null);
  useEffect(()=>{if(revealKey!=null)revealed.add(revealKey);},[revealKey]);
  const pipeline=result.pipeline,known=pipeline?.width>0&&pipeline?.height>0;
  useEffect(()=>{
    if(known||!source?.image)return;
    const img=new Image();let live=true;
    img.onload=()=>{if(live&&img.naturalWidth)setNatural({width:img.naturalWidth,height:img.naturalHeight});};
    img.src=source.image;return ()=>{live=false;};
  },[known,source?.image]);
  const width=known?pipeline.width/(pipeline.crop?.width||1):natural?.width||1000,height=known?pipeline.height/(pipeline.crop?.height||1):natural?.height||1000;
  const pieces=result.garments.map((garment,index)=>({garment,index,crop:detectionCrop(result,garment),tint:/^#[0-9a-f]{6}$/i.test(garment.color||'')?garment.color:'#a0a18f'}));
  const toggle=index=>{if(!busy)setSelected(old=>old.includes(index)?old.filter(i=>i!==index):[...old,index].sort((a,b)=>a-b));};
  const unit=Math.max(width,height)/100,count=pieces.length;
  return <section className={`photo-detections ${settled?'is-settled':''}`} aria-label="Detected pieces" style={{'--count':count}}>
    <p className="eyebrow">ONE PHOTO, SEPARATE PIECES</p>
    <h3><span className="detected-count">{count}</span> piece{count===1?'':'s'} found</h3>
    <p>Choose the pieces you want in your closet. You’ll review each name, color and category before saving.</p>
    {result.quality?.warnings?.length>0&&<aside className="notice" role="status"><strong>A quick photo check</strong>{result.quality.warnings.map(w=><p key={w}>{w}</p>)}<p>We kept the usable pieces. Compare them with your photo before continuing.</p></aside>}
    <div className="detected-stage" aria-hidden="true" style={{maxWidth:`${Math.round(340*width/height)}px`}}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <image href={source.image} width={width} height={height} preserveAspectRatio="none"/>
        <rect className="detected-veil" width={width} height={height}/>
        {pieces.map(({index,crop,tint})=>{
          const x=crop.x*width,y=crop.y*height,w=crop.width*width,h=crop.height*height,on=selected.includes(index);
          return <g key={index} className={`detected-box ${on?'':'is-off'} ${active===index?'is-active':''} ${active!=null&&active!==index?'is-dim':''}`} style={{'--i':index,'--piece':tint}} onClick={()=>toggle(index)} onPointerEnter={()=>setActive(index)} onPointerLeave={()=>setActive(null)}>
            <svg x={x} y={y} width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="none" className="detected-lift"><image href={source.image} width={width} height={height} preserveAspectRatio="none"/></svg>
            <rect x={x} y={y} width={w} height={h} rx={unit*1.2} pathLength="1" strokeWidth={unit*.7}/>
            <g className="detected-tag" style={{transformOrigin:`${x+unit*3}px ${y+unit*3}px`}}><circle cx={x+unit*3} cy={y+unit*3} r={unit*3.2}/><text x={x+unit*3} y={y+unit*3} fontSize={unit*3.6} textAnchor="middle" dominantBaseline="central">{index+1}</text></g>
          </g>;
        })}
        <rect className="detected-beam" x="0" y={-height*.18} width={width} height={height*.18}/>
      </svg>
    </div>
    <div className="detected-grid">{pieces.map(({garment,index,crop,tint})=>{
      const checked=selected.includes(index),view=paddedCrop(crop);
      return <label className={`detected-card ${checked?'selected':''} ${active===index?'is-active':''}`} key={garment.detectionId||index} style={{'--i':index,'--piece':tint}} onPointerEnter={()=>setActive(index)} onPointerLeave={()=>setActive(null)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)}>
        <span className="detected-frame">
          <svg className="detected-crop" viewBox={`${view.x*width} ${view.y*height} ${view.width*width} ${view.height*height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Suggested crop: ${garment.name}`}><image href={source.image} width={width} height={height} preserveAspectRatio="none"/></svg>
          <span className="detected-number" aria-hidden="true">{index+1}</span>
          <span className="detected-keep" aria-hidden="true">{checked?'✓ Keeping':'Skipped'}</span>
        </span>
        <span className="detected-title"><input type="checkbox" checked={checked} disabled={busy} onChange={()=>toggle(index)}/><strong>{garment.name}</strong></span>
        <small><i className="detected-swatch"/>{garment.colorName}<b>{garment.category}</b></small>
      </label>;
    })}</div>
    {result.sceneNotes?.length>0&&<p className="muted">{result.sceneNotes.join(' ')}</p>}
    <p className="muted">Crops are AI suggestions. Tap a card or its outline in the photo to skip anything incorrect; you can replace a crop with your own photo during review.</p>
    <button className="primary" type="button" disabled={busy||!selected.length} onClick={()=>onReview(selected)}>{busy?'Preparing pieces…':`Review ${selected.length} selected piece${selected.length===1?'':'s'}`}</button>
  </section>;
}
