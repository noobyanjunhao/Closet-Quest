import React,{useState} from 'react';
import { detectionCrop } from './photo-import.js';
import './photo-detections.css';

export default function PhotoDetections({source,result,busy,onReview}) {
  const [selected,setSelected]=useState(()=>result.garments.map((_,index)=>index));
  return <section className="photo-detections" aria-label="Detected pieces">
    <p className="eyebrow">ONE PHOTO, SEPARATE PIECES</p>
    <h3>{result.garments.length} pieces found</h3>
    <p>Choose the pieces you want in your closet. You’ll review each name, color and category before saving.</p>
    <div className="detected-grid">{result.garments.map((garment,index)=>{
      const crop=detectionCrop(result,garment),checked=selected.includes(index);
      const width=(result.pipeline?.width||1000)/(result.pipeline?.crop?.width||1),height=(result.pipeline?.height||1000)/(result.pipeline?.crop?.height||1);
      return <label className={`detected-card ${checked?'selected':''}`} key={garment.detectionId||index}>
        <svg className="detected-crop" viewBox={`${crop.x*width} ${crop.y*height} ${crop.width*width} ${crop.height*height}`} width="100%" height="150" role="img" aria-label={`Suggested crop: ${garment.name}`}><image href={source.image} width={width} height={height}/></svg>
        <span className="detected-title"><input type="checkbox" checked={checked} disabled={busy} onChange={()=>setSelected(old=>checked?old.filter(i=>i!==index):[...old,index].sort((a,b)=>a-b))}/><strong>{garment.name}</strong></span>
        <small>{garment.category} · {garment.colorName}</small>
      </label>;
    })}</div>
    {result.sceneNotes?.length>0&&<p className="muted">{result.sceneNotes.join(' ')}</p>}
    <p className="muted">Crops are AI suggestions. Deselect anything incorrect; you can replace a crop with your own photo during review.</p>
    <button className="primary" type="button" disabled={busy||!selected.length} onClick={()=>onReview(selected)}>{busy?'Preparing pieces…':`Review ${selected.length} selected piece${selected.length===1?'':'s'}`}</button>
  </section>;
}
