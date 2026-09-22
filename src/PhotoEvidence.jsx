import React from 'react';
import baseline from '../vision/results/photo-collection-smoke.json';
import evidence from '../vision/results/pipeline-v2-development.json';
import { photoCollection } from './wardrobe.js';

export default function PhotoEvidence() {
  return <section className="panel photo-evidence">
    <p className="eyebrow">EARLIER GEMMA BASELINE · DEVELOPMENT CHECK</p><h2>A clearer read on your wardrobe.</h2>
    <p>This earlier Gemma pipeline matched {evidence.summary.categoryMatches} of {evidence.summary.total} intended categories, up from {baseline.summary.categoryMatches}. These same seven demo photos were used to debug the first run, so this measures a development improvement, not accuracy on new garments or a comparison with the current Qwen model.</p>
    <div className="pipeline-metrics"><div><span>Category matches</span><strong>{baseline.summary.categoryMatches}/7 → {evidence.summary.categoryMatches}/7</strong></div><div><span>Analyses returned</span><strong>{evidence.summary.completed}/{evidence.summary.total}</strong></div><div><span>Blank-image check</span><strong>{evidence.summary.negativeControlsPassed===evidence.summary.negativeControlsTotal?'Rejected correctly':'Needs work'}</strong></div></div>
    <div className="evidence-table-wrap"><table><thead><tr><th>Photograph</th><th>Expected</th><th>Before</th><th>Now</th><th>Time¹</th></tr></thead><tbody>{evidence.recognition.map(r=><tr key={r.id}>
      <td><div className="evidence-photo"><img src={`photos/${r.id}.jpg`} alt=""/><a href={r.source} target="_blank" rel="noreferrer">{photoCollection.find(p=>p.sampleId===r.id)?.name}</a></div></td><td>{r.expectedCategory}</td>
      <td className={r.baselineMatches?'result-match':'result-review'}>{r.baselineCategory||'Rejected'}</td><td className={r.categoryMatches?'result-match':'result-review'}>{r.data?.category||'Rejected'}{r.categoryMatches?' ✓':''}</td><td>{(r.totalMs/1000).toFixed(1)} s</td>
    </tr>)}</tbody></table></div>
    <p className="muted">¹ One local run on {new Date(evidence.date).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}, including polling. Model: gemma3:4b · {evidence.pipelineVersion}. The earlier revised run took 90.7 seconds for its first photo; subsequent photos took 3.6–4.2 seconds. Loading and runtime conditions affect latency.</p>
    <details className="pipeline-notes"><summary>What improved, and what still needs review?</summary><p>Item types now determine categories; a pair of shoes counts as one item. Color names map to approximate palette swatches, and label text stays manual. Images are decoded, normalized and checked for uniform pixels before inference.</p><p>The model initially invented a sweater in a blank image. The pixel check now rejects that image before the model runs. This synthetic control does not establish rejection of other unrelated objects. Descriptions can still invent details such as heels, buttons or linings. Review suggestions before saving.</p><p>Schema and prompt refinements only; no weight training. The original run and every revised evaluation are retained. A separate set of real photographs and human attribute checks are still needed.</p></details>
  </section>;
}
