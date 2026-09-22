import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../src/logic.js';
import { addPhotoCollection, deleteGarment, migrateState, newPhotoState, recordWear, saveLook, undoLastWear } from '../src/wardrobe.js';

test('migration preserves existing photos, corrections, XP and deleted seed pieces',()=>{
  const old=initialState();old.items=old.items.slice(1);old.items[0]={...old.items[0],name:'My edited jeans',image:'data:image/jpeg;base64,YQ=='};old.xp=100;
  const next=migrateState(old);
  assert.deepEqual(next.items,old.items);assert.equal(next.xp,100);assert.deepEqual(next.savedOutfits,[]);assert.deepEqual(next.wearRecords,[]);
});
test('photo collection is opt-in for old closets and repeat import is idempotent',()=>{
  const old=migrateState(initialState()), next=addPhotoCollection(old);
  assert.equal(old.items.length,6);assert.equal(next.items.length,13);assert.deepEqual(addPhotoCollection(next),next);
  assert.ok(newPhotoState().items.every(i=>i.image&&i.sampleId));
  const replaced=newPhotoState();replaced.items[0]={...replaced.items[0],sampleId:undefined,image:'data:image/jpeg;base64,YQ=='};
  const supplemented=addPhotoCollection(replaced);assert.equal(new Set(supplemented.items.map(i=>i.id)).size,supplemented.items.length);assert.equal(supplemented.items[0].image,replaced.items[0].image);
});
test('wear events deduplicate requests, preserve old counts, and undo exactly',()=>{
  const state=newPhotoState(), ids=[state.items[0].id,state.items[2].id];state.items[0].lastWorn='2026-09-01T00:00:00Z';
  const next=recordWear(state,ids,{id:'event-1',at:'2026-09-21T12:00:00Z'});
  assert.equal(next.items[0].wears,state.items[0].wears+1);assert.equal(next.wearRecords.length,1);
  assert.equal(recordWear(next,ids,{id:'event-1'}),next);
  const undone=undoLastWear(next);assert.equal(undone.items[0].wears,state.items[0].wears);assert.equal(undone.items[0].lastWorn,state.items[0].lastWorn);assert.equal(undone.wearRecords.length,0);
  assert.throws(()=>recordWear(state,['missing']));
});
test('saved outfits reject missing/duplicate pieces, deduplicate combinations and cascade deletion',()=>{
  let state=newPhotoState();const ids=state.items.slice(0,3).map(i=>i.id), details={title:'Weekend',context:'Campus casual',explanation:'A relaxed combination.',engine:'baseline'};
  assert.throws(()=>saveLook(state,[ids[0]],details));assert.throws(()=>saveLook(state,[...ids,ids[0]],details));
  state=saveLook(state,ids,details);assert.throws(()=>saveLook(state,[...ids].reverse(),details));
  state=recordWear(state,ids,{id:'wear-1'});state=deleteGarment(state,ids[0]);
  assert.equal(state.savedOutfits.length,0);assert.ok(!state.items.some(i=>i.id===ids[0]));assert.ok(!state.wearRecords[0].itemIds.includes(ids[0]));assert.ok(!(ids[0] in state.wearRecords[0].previousLastWorn));
  assert.doesNotThrow(()=>undoLastWear(state));
});
