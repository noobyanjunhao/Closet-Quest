import React,{useEffect,useId,useState} from 'react';
import {parseHexColor} from './garment-colors.js';

export default function GarmentColorField({value,onChange}) {
  const color=parseHexColor(value)||'#a0a18f';
  const [draft,setDraft]=useState(color),[invalid,setInvalid]=useState(false);
  const messageId=useId();
  useEffect(()=>{setDraft(color);setInvalid(false);},[color]);
  function edit(text){
    setDraft(text);
    const parsed=parseHexColor(text);
    if(parsed){setInvalid(false);onChange(parsed);}
  }
  return <div className="garment-color-field"><div className="garment-color-controls">
    <label>Color<input type="color" value={color} onChange={event=>{setDraft(event.target.value);setInvalid(false);onChange(event.target.value);}}/></label>
    <label>Hex color<input type="text" value={draft} maxLength={7} spellCheck={false} autoCapitalize="none" placeholder="#223344" aria-invalid={invalid} aria-describedby={invalid?messageId:undefined} onChange={event=>edit(event.target.value)} onBlur={()=>setInvalid(!parseHexColor(draft))}/></label>
  </div>{invalid&&<p id={messageId} className="color-entry-help" role="status">Use # and six hex digits, like #223344. Your previous color is kept until this is valid.</p>}</div>;
}
