import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, recommend, completeQuest, markWorn, listing, quests } from '../src/logic.js';

test('outfit uses owned pieces and prioritizes a low-use matching item', () => {
  const state = initialState(), outfit = recommend(state.items, 'Coffee date');
  assert.deepEqual(outfit.map(i => i.category), ['Top', 'Bottom', 'Shoes']);
  assert.equal(outfit[0].id, '4');
  assert.ok(outfit.every(i => state.items.includes(i)));
});
test('incomplete closets cannot produce an outfit; dress plus shoes can', () => {
  assert.deepEqual(recommend([], 'Campus casual'), []);
  assert.deepEqual(recommend(initialState().items.filter(i => i.category !== 'Shoes'), 'Campus casual'), []);
  const items = [{ id:'dress',category:'Dress',tags:'Coffee date',wears:0 }, initialState().items[2]];
  assert.equal(recommend(items,'Coffee date').length,2);
});
test('quest rewards only once and validates context, ownership, and low-use rule', () => {
  const state=initialState(), quest=quests[0], outfit=recommend(state.items,quest.context);
  const completed=completeQuest(state,quest,outfit,quest.context);
  assert.equal(completed.xp,50);
  assert.equal(completed.submissions.length,1);
  assert.throws(()=>completeQuest(completed,quest,outfit,quest.context));
  assert.throws(()=>completeQuest(state,quest,outfit,'Coffee date'));
  assert.throws(()=>completeQuest(state,quest,[{id:'not-owned'}],quest.context));
  const used={...state,items:state.items.map(i=>({...i,wears:10}))};
  assert.throws(()=>completeQuest(used,quest,recommend(used.items,quest.context),quest.context));
});
test('marking an outfit worn increments only its pieces without mutating old state', () => {
  const state=initialState(), next=markWorn(state,['1','3']);
  assert.equal(next.items[0].wears,9);
  assert.equal(next.items[1].wears,12);
  assert.equal(next.items[2].wears,16);
  assert.equal(state.items[0].wears,8);
  assert.ok(next.items[0].lastWorn);
});
test('resale drafts include garment data and require condition verification', () => {
  const draft=listing(initialState().items[0]);
  assert.match(draft,/Everyday cotton tee/);
  assert.match(draft,/condition/);
  assert.match(draft,/do not establish condition/);
});
test('quest submission rejects partial, duplicate, and forged outfits', () => {
  const state=initialState(),quest=quests[0],outfit=recommend(state.items,quest.context);
  assert.throws(()=>completeQuest(state,quest,[outfit[0]],quest.context));
  assert.throws(()=>completeQuest(state,quest,[...outfit,outfit[0]],quest.context));
  const wrong={...state,items:state.items.map(i=>({...i,tags:'Coffee date'}))};
  assert.throws(()=>completeQuest(wrong,quest,outfit,quest.context));
});
