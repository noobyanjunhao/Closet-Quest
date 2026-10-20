import React,{useEffect,useRef,useState} from 'react';
import {cleanBackdrop} from './background.js';
import {applyCutout,originalPhoto} from './garment-display.js';

export default function GarmentDisplay({item,onChange}) {
  const [preview,setPreview]=useState(null),[status,setStatus]=useState(''),[error,setError]=useState(''),[showOriginal,setShowOriginal]=useState(false);
  const worker=useRef(null),run=useRef(0),timer=useRef(null);
  const source=item.image;
  function cancel(){run.current++;worker.current?.terminate();worker.current=null;clearTimeout(timer.current);setStatus('');}
  useEffect(()=>()=>{run.current++;worker.current?.terminate();clearTimeout(timer.current);},[item.id,source]);
  async function prepare(method) {
    cancel();const token=run.current;setError('');setPreview(null);setStatus('Preparing preview…');
    try {
      if(method==='plain'){
        const image=await cleanBackdrop(source);
        if(token===run.current){setPreview({image,method});setStatus('');}
        return;
      }
      const w=new Worker(new URL('./cutout.worker.js',import.meta.url),{type:'module'});worker.current=w;
      const fail=message=>{if(token!==run.current)return;cancel();setError(message);};
      timer.current=setTimeout(()=>fail('This device could not finish in time. Try plain-background cleanup or a pixel icon.'),240000);
      w.onerror=()=>fail('The cutout model could not load. Try again, or use plain-background cleanup.');
      w.onmessage=async({data})=>{
        if(token!==run.current)return;
        if(data.error){fail('AI could not separate this photo on this device. Try a closer photo, plain-background cleanup, or a pixel icon.');return;}
        if(data.progress){setStatus(data.progress);return;}
        if(data.blob){
          const reader=new FileReader();
          reader.onload=()=>{if(token!==run.current)return;setPreview({image:reader.result,method:'U2Netp'});cancel();};
          reader.onerror=()=>fail('The cutout preview could not be read.');
          reader.readAsDataURL(data.blob);
        }
      };
      w.postMessage({source:new URL(source,location.href).href});
    } catch(e) {if(token===run.current){cancel();setError(e.message);}}
  }
  return <section className="garment-display">
    <div className="display-heading"><strong>Closet appearance</strong><span>Your piece, your way</span></div>
    <div className="display-options" role="group" aria-label="Garment appearance">
      {[['photo','Photo'],['cutout','Cutout'],['pixel','Pixel icon']].map(([mode,label])=><button key={mode} type="button" aria-pressed={(item.displayMode||(item.cutoutImage?'cutout':'photo'))===mode} disabled={mode==='cutout'&&!item.cutoutImage} onClick={()=>onChange({...item,displayMode:mode})}>{label}</button>)}
    </div>
    {item.displayMode==='pixel'&&<p className="muted">A simple category icon in your garment’s color. Your photo stays attached.</p>}
    <details className="cutout-tools">
      <summary>✧ Create a garment cutout</summary>
      <p className="muted">Best with one piece laid flat or on a hanger. For an outfit photo, split it into pieces first. AI may keep skin or other foreground objects; review the preview.</p>
      <p className="muted">AI runs on this device. First use downloads the cutout engine and a small model. You can cancel at any time.</p>
      <div className="toolbar"><button type="button" disabled={!!status} onClick={()=>prepare('ai')}>Try AI cutout</button><button type="button" disabled={!!status} onClick={()=>prepare('plain')}>Plain-background cleanup</button></div>
      {status&&<div role="status"><p>{status}</p><button type="button" onClick={cancel}>Cancel cutout</button></div>}
      {error&&<p role="alert">{error}</p>}
      {preview&&<div className="cutout-review"><img src={preview.image} alt="Review garment cutout"/><p>Check the edges and make sure the whole piece is here.</p><div className="toolbar"><button type="button" className="primary" onClick={()=>{onChange(applyCutout(item,preview.image,preview.method));setPreview(null);}}>Use this cutout</button><button type="button" onClick={()=>setPreview(null)}>Discard preview</button></div></div>}
    </details>
    <button type="button" className="original-photo-link" aria-expanded={showOriginal} onClick={()=>setShowOriginal(v=>!v)}>{showOriginal?'Hide original photo':'View original photo ↗'}</button>
    {showOriginal&&<img className="original-photo-preview" src={originalPhoto(item)} alt={`Original upload for ${item.name}`}/>}
  </section>;
}
