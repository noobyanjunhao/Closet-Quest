export const BETA_PROTOCOL='closet-beta-s9-v1';
export const BETA_TASKS=[
  {id:'upload',title:'Add your clothes',brief:'Use your phone to photograph and upload at least three pieces. Include one photo with more than one visible piece.'},
  {id:'review',title:'Review what the AI found',brief:'Compare every suggestion with the photo. Correct names/categories and add anything missing before saving.'},
  {id:'style',title:'Get dressed for an occasion',brief:'Ask for a look for a real event. Decide whether you would wear any of the first three suggestions. Check the supporting evidence.'},
  {id:'save',title:'Keep a look',brief:'Save a look, record a wear, navigate away and return. Check that your work is still there.'},
  {id:'shops',title:'Explore a missing piece',brief:'If your closet is incomplete, inspect the optional external finds. Check a retailer link and the observed-price date. Buying is not required.'},
  {id:'return',title:'Come back safely',brief:'Export a closet backup, sign out, then sign back in. Confirm your pieces and saved look are still present.'},
];
export function startBetaSession({participant,independent,consent,ownPhotos,freezeConfirmed,revision,sampleCount=0,now=Date.now()}){
  if(!/^p\d{2,3}$/.test(participant)||!consent)throw Error('Use a participant code such as p01 and agree to record the session.');
  if(independent&&(!ownPhotos||!freezeConfirmed||sampleCount||!/^[a-f\d]{40}$/.test(revision||'')))throw Error('An independent test needs your own photos, no sample clothes, and a frozen deployed revision.');
  return {protocol:BETA_PROTOCOL,participant,source:independent?'independent':'rehearsal',consent:true,ownPhotos,freezeConfirmed,revision:revision||'local-unversioned',startedAt:new Date(now).toISOString(),tasks:BETA_TASKS.map(t=>({id:t.id,status:'pending',elapsedMs:null,assisted:null})),acceptance:null,correctionCount:null,correctionSeconds:null,evidenceUseful:null,issues:[]};
}
export function betaExport(session){
  if(!session)return null;
  // An explicit allowlist prevents future UI fields from silently exporting photos,
  // names, prompts, tokens or preference documents.
  const fields=['protocol','participant','source','consent','ownPhotos','freezeConfirmed','revision','revisionChanged','lastObservedRevision','startedAt','acceptance','correctionCount','correctionSeconds','evidenceUseful'];
  const result=Object.fromEntries(fields.map(k=>[k,session[k]??null]));
  result.tasks=BETA_TASKS.map(t=>{const r=session.tasks?.find(r=>r.id===t.id)||{};return {id:t.id,status:r.status||'pending',elapsedMs:Number.isFinite(r.elapsedMs)?r.elapsedMs:null,assisted:typeof r.assisted==='boolean'?r.assisted:null};});
  result.issues=(session.issues||[]).filter(i=>['upload','recognition','styling','shopping','sync','accessibility','other'].includes(i));
  result.completedTasks=result.tasks.filter(t=>t.status==='passed').length;result.taskDenominator=BETA_TASKS.length;
  result.independentEvidenceComplete=result.source==='independent'&&result.tasks.every(t=>['passed','failed','skipped'].includes(t.status))&&result.freezeConfirmed===true&&result.revisionChanged!==true;
  result.notes=['Self-reported independent session; reviewer must verify independence and release freeze.','Skipped/failed tasks remain in the denominator.','Correction time and outfit acceptance are separate from model success and task duration.','This export omits photos, free-text briefs, garment names, account identity and style-note contents.'];
  return result;
}

