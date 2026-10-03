import test from 'node:test';
import assert from 'node:assert/strict';
import { alphaDemoState } from '../src/alpha-demo.js';
import { recordWear, recordWearToday, wornToday, undoLastWear, saveLook, migrateState } from '../src/wardrobe.js';

test('alpha rehearsals start independently without tee or learned personal data',()=>{
  const a=alphaDemoState(),b=alphaDemoState();
  assert.notEqual(a.wardrobeId,b.wardrobeId);assert.equal(a.items.length,6);
  assert.equal(a.learningEnabled,false);assert.ok(a.items.every(i=>i.sampleId!=='tee'));
  a.items.pop();assert.equal(b.items.length,6);
});
test('wear today deduplicates across generated and saved looks, reload and reordered IDs; undo permits retry',()=>{
  let state=alphaDemoState();const ids=['photo-knit','photo-denim','photo-sneakers'];
  const at='2026-10-02T16:00:00Z';
  state=recordWearToday(state,ids,{at});
  const restored=migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(recordWearToday(restored,[...ids].reverse(),{at,outfitId:'saved-look'}),restored);
  assert.equal(wornToday(restored,ids,at),true);
  const undone=undoLastWear(restored);assert.equal(wornToday(undone,ids,at),false);
  assert.equal(recordWearToday(undone,ids,{at}).wearRecords.length,1);
  assert.equal(recordWearToday(restored,ids,{at:'2026-10-03T16:00:00Z'}).wearRecords.length,2);
});
test('legacy wear IDs prevent the same daily combination being counted again',()=>{
  const ids=['photo-knit','photo-denim','photo-sneakers'],at='2026-10-02T16:00:00Z';
  const state=recordWear(alphaDemoState(),ids,{id:'old-generated-id',at});
  assert.equal(recordWearToday(state,ids,{at}),state);
});
test('save look rejects unreviewed garments at the persistence boundary',()=>{
  const state=alphaDemoState();state.items.find(i=>i.id==='photo-knit').needsReview=true;
  assert.throws(()=>saveLook(state,['photo-knit','photo-denim','photo-sneakers'],{context:'Campus casual'}),/reviewed/);
});

test('undo wear restores recommendation history to its prior worn state',()=>{
  const ids=['photo-knit','photo-denim','photo-sneakers'];
  let state={...alphaDemoState(),recommendationHistory:[{runId:'run-1'}]};
  state=recordWearToday(state,ids,{at:'2026-10-01T16:00:00Z',runId:'run-1'});
  state=recordWearToday(state,ids,{at:'2026-10-02T16:00:00Z',runId:'run-1'});
  state=undoLastWear(state);assert.equal(state.recommendationHistory[0].wornAt,'2026-10-01T16:00:00Z');
  state=undoLastWear(state);assert.equal(state.recommendationHistory[0].wornAt,undefined);
});
