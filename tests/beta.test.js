import test from 'node:test';
import assert from 'node:assert/strict';
import {startBetaSession,betaExport,BETA_TASKS} from '../src/beta-test.js';
import {exportValidation} from '../src/validation.js';
import {releaseInfo} from '../server/release.js';
const setup={participant:'p01',consent:true,independent:true,ownPhotos:true,freezeConfirmed:true,revision:'a'.repeat(40)};
test('independent test requires consent, own photos, no samples and a frozen revision',()=>{
  for(const patch of [{consent:false},{ownPhotos:false},{freezeConfirmed:false},{sampleCount:1},{revision:'local'}])assert.throws(()=>startBetaSession({...setup,...patch}));
  assert.equal(startBetaSession(setup).source,'independent');assert.equal(startBetaSession({...setup,independent:false,revision:null}).source,'rehearsal');
});
test('beta evidence preserves missing outcomes and denominator, and excludes private fields',()=>{
  const s=startBetaSession(setup);s.secret='do not export';s.tasks[0]={...s.tasks[0],status:'failed',elapsedMs:12000,assisted:true,photo:'secret'};
  const e=betaExport(s);assert.equal(e.taskDenominator,BETA_TASKS.length);assert.equal(e.completedTasks,0);assert.equal(e.independentEvidenceComplete,false);assert.equal(e.acceptance,null);assert.ok(!JSON.stringify(e).includes('secret'));
});
test('paired-study export strips display explanations, evidence text and unrecognized fields',()=>{
  const r=exportValidation([{id:'1',source:'participant',condition:'full',status:'ready',outfits:[{accepted:true,itemIds:['private-id'],explanation:'private-explanation'}],display:{sources:[{excerpt:'private-note'}]},brief:'private-brief'}],[{source:'participant',image:'private-photo',activeMs:4}]);
  assert.ok(!JSON.stringify(r).includes('private-'));assert.equal(r.summary.conditions.full.top3Acceptance.numerator,1);
});
test('release metadata exposes only validated non-secret build identity',()=>{
  assert.deepEqual(releaseInfo({RENDER_GIT_COMMIT:'bad',OPENAI_API_KEY:'secret'}),{version:'0.2.0-beta.1',protocol:'closet-beta-s9-v1',revision:null});
});

