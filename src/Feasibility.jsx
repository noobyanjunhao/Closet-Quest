import React, { useState } from 'react';
import fixtures from '../experiments/data/wardrobes.json';
import results from '../experiments/results/latest.json';
import { recommend as baseline } from '../experiments/baseline-v1.js';
import { rankOutfits } from './recommender.js';

export default function Feasibility() {
  const [wardrobeId,setWardrobeId]=useState('context-conflict-1'),[context,setContext]=useState('Presentation day'),[quest,setQuest]=useState(false);
  const wardrobe=fixtures.wardrobes.find(w=>w.id===wardrobeId);
  const before=[0,1,2].map(n=>baseline(wardrobe.items,context,n)).filter(o=>o.length);
  const after=rankOutfits(wardrobe.items,context,{requireLowUse:quest});
  return <><section className="notice"><b>Sprint 3 experiment</b><br/>30 authored synthetic wardrobes · 180 requests · no user preference ratings or vision inference. Results measure metadata constraints, not fashion taste.</section><section className="stats"><div><strong>78 → 98</strong><span>feasible requests solved / 98</span></div><div><strong>36 → 82</strong><span>correct abstentions / 82</span></div><div><strong>0</strong><span>invalid prototype suggestions</span></div></section><section className="panel"><h2>Inspect the baseline beside the prototype</h2><div className="toolbar"><label>Wardrobe scenario<select value={wardrobeId} onChange={e=>setWardrobeId(e.target.value)}>{fixtures.wardrobes.map(w=><option key={w.id} value={w.id}>{w.id}</option>)}</select></label><label>Experiment context<select value={context} onChange={e=>setContext(e.target.value)}>{['Campus casual','Coffee date','Presentation day'].map(c=><option key={c}>{c}</option>)}</select></label></div><label className="checkbox-label"><input type="checkbox" checked={quest} onChange={e=>setQuest(e.target.checked)}/>Require a piece worn once or less</label></section><div className="comparison-grid">{[['Original baseline',before],['Ranked prototype',after.outfits.map(o=>o.items)]].map(([title,outfits])=><section className="panel" key={title}><h2>{title}</h2>{outfits.length?outfits.map((outfit,n)=><div className="comparison-outfit" key={n}><b>Option {n+1}</b><ul>{outfit.map(i=><li key={i.id}>{i.name}<small>{i.tags || 'No context tags'} · {i.wears} wears</small></li>)}</ul></div>):<p>{title==='Ranked prototype'?after.reason:'No outfit returned.'}</p>}</section>)}</div><p className="muted">Recorded benchmark: {results.generatedAt.slice(0,10)} · Node {results.environment.node} · Warm CPU calls. Run npm run benchmark to reproduce. Current inspection uses the same production ranker.</p></>;
}
