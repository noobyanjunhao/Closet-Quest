import React, {useEffect,useState} from 'react';
import {api,downloadJson} from './photos.js';
import visionRun from '../vision/results/plan-a-development.json';

export default function MLStatus({status={}}) {
  const [learning,setLearning]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let alive=true;api('learning/status',null,'GET').then(data=>{if(alive)setLearning(data);}).catch(error=>{if(alive)setError(error.message);});return()=>{alive=false;};},[]);
  const models=[['Photo recognition',status.models?.recognition,status.recognitionReady],['Outfit explanations',status.models?.stylist,status.stylistReady],['Meaning-based retrieval',status.models?.embedding,status.embeddingReady]];
  const ranker=learning?.ranker,test=ranker?.metrics?.test;
  async function exportExamples(){try{downloadJson(await api('learning/export',null,'GET'),'closet-learning-metadata.json');}catch(error){setError(error.message);}}
  return <section className="panel rag-evidence" aria-label="Local models and learning">
    <p className="eyebrow">MODELS & LEARNING</p><h2>What is running. What is learning.</h2>
    <div className="evidence-table-wrap"><table><thead><tr><th>Task</th><th>Local model</th><th>Installed</th></tr></thead><tbody>{models.map(([task,name,ready])=><tr key={task}><td>{task}</td><td>{name||'Checking…'}</td><td>{ready===true?'Yes':ready===false?'Not ready':'Unknown'}</td></tr>)}</tbody></table></div>
    {status.models?.recognition===visionRun.model&&<p>The current recognizer returned all seven demo analyses with <strong>{visionRun.summary.categoryMatches}/{visionRun.summary.total} category matches</strong>. These reused photos are a development check, not measured accuracy on new clothes. Colors and other details still need your review.</p>}
    {error&&<p role="status">{error}</p>}
    {!learning&&!error&&<p role="status">Checking learning data…</p>}
    {learning&&<>
      <p><strong>{learning.realReviewedExamples} eligible real examples</strong> · {learning.sampleEvents} sample events excluded. Feedback stays in a local metadata log; photos, names and raw mood briefs are not collected.</p>
      <details className="pipeline-notes"><summary>Trained ranking experiment</summary><p>{ranker?.modelVersion?'A small ranking model has been trained on authored wardrobe fixtures.':'No trained ranking artifact is available.'} Live learned reranking is <strong>{ranker?.active?'explicitly enabled for experimentation':'off'}</strong>.</p>{test&&<p>On the reserved synthetic test set, NDCG@5 changed from <strong>{test.baseline.ndcgAt5.toFixed(3)}</strong> to <strong>{test.trained.ndcgAt5.toFixed(3)}</strong>. Labels measure occasion, category and rediscovery matches. They do not measure personal taste or the live hybrid pipeline. Dense features have not been trained.</p>}</details>
      <details className="pipeline-notes"><summary>Fine-tuning readiness</summary><p>Feedback never automatically trains or deploys a LoRA adapter. Collect at least 60 distinct approved examples in one task across 12 input groups, then run the data preflight. A successful preflight also requires separate train, validation and test groups.</p><p>Photo corrections export as text metadata only; training the vision model would need a separate image dataset with explicit consent.</p><button onClick={exportExamples}>Export learning metadata</button></details>
    </>}
  </section>;
}
