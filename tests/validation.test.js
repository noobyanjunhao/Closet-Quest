import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeValidation,orderFor,measureOutfits,exportValidation} from '../src/validation.js';
const trial=(id,overrides={})=>({id,pairId:'pair',condition:'full',participant:'p01',source:'participant',status:'ready',elapsedMs:100,outfits:[{itemIds:['top','bottom','shoe'],accepted:null}],checks:[],...overrides});
test('exported human summary excludes fully rated development rehearsals',()=>{
  const value=exportValidation([trial('real'),trial('dev',{source:'development',outfits:[{accepted:true}]})],[{source:'development',activeMs:20,hasSuggestion:true,changedFields:['category']}]);
  assert.equal(value.summary.conditions.full.attempts,1);assert.equal(value.summary.conditions.full.top3Acceptance.denominator,0);assert.equal(value.summary.photoReviews.count,0);
  assert.equal(value.developmentSummary.conditions.full.top3Acceptance.numerator,1);assert.equal(value.developmentSummary.photoReviews.count,1);
});
test('unmeasured human metrics stay null and absent ratings are not rejection',()=>{
  const result=summarizeValidation([trial('1')]);
  assert.equal(result.conditions.full.top3Acceptance.value,null);
  assert.equal(result.conditions.full.ratingCoverage.numerator,0);
  assert.equal(result.conditions.full.ratingCoverage.denominator,1);
  assert.equal(result.conditions.full.evidenceUsefulness.denominator,0);
});
test('failed cancelled and unscored attempts remain explicit denominators',()=>{
  const result=summarizeValidation([trial('1',{outfits:[{accepted:true}]}),trial('2',{status:'failed'}),trial('3',{status:'cancelled'}),trial('4')]);
  assert.deepEqual(result.conditions.full.top3Acceptance,{numerator:1,denominator:1,value:1});
  assert.equal(result.conditions.full.acceptancePerAttempt.denominator,4);
  assert.equal(result.conditions.full.ratingCoverage.denominator,2);
  assert.equal(result.conditions.full.failed,1);assert.equal(result.conditions.full.cancelled,1);
});
test('paired acceptance uses the same brief and complete ratings; duplicate exports deduplicate',()=>{
  const a=trial('a',{condition:'baseline',outfits:[{accepted:false}]}),b=trial('b',{outfits:[{accepted:true}]});
  const result=summarizeValidation([a,b,b,trial('other',{pairId:'other'})]);
  assert.equal(result.pairedBriefs,1);assert.equal(result.pairedAcceptanceDifference,1);
  assert.equal(result.conditions.full.attempts,2);
});
test('AB BA order counterbalances participants and consecutive briefs',()=>{
  assert.deepEqual(orderFor('p01'),['full','baseline']);assert.deepEqual(orderFor('p02'),['baseline','full']);
  assert.deepEqual(orderFor('p01',1),['baseline','full']);
});
test('structural scoring rejects unowned unreviewed duplicate and incomplete looks',()=>{
  const items=[{id:'top',category:'Top'},{id:'bottom',category:'Bottom'},{id:'shoe',category:'Shoes'},{id:'draft',category:'Top',needsReview:true}];
  const scores=measureOutfits([{itemIds:['top','bottom','shoe']},{itemIds:['top','shoe']},{itemIds:['ghost','bottom','shoe']},{itemIds:['draft','bottom','shoe']},{itemIds:['top','bottom','shoe','shoe']}],items);
  assert.deepEqual(scores.map(score=>score.valid),[true,false,false,false,false]);
});
test('rehearsals do not create participant counts, corrections use suggested denominator',()=>{
  const result=summarizeValidation([trial('a',{source:'development'})],[{hasSuggestion:true,activeMs:100,changedFields:[]},{hasSuggestion:false,activeMs:300,changedFields:['category']}]);
  assert.equal(result.participants,0);assert.equal(result.photoReviews.medianActiveReviewMs,200);assert.equal(result.photoReviews.categoryCorrections.numerator,0);assert.equal(result.photoReviews.categoryCorrections.denominator,1);
  assert.equal(exportValidation([],[]).schemaVersion,1);
});
