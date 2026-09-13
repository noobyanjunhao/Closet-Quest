import test from 'node:test';
import assert from 'node:assert/strict';
import { rankOutfits, validShape } from '../src/recommender.js';
import { rankOutfits as exhaustive } from '../experiments/exhaustive-recommender.js';
import { readFileSync } from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../experiments/data/wardrobes.json',import.meta.url)));
test('bounded ranking equals exhaustive top three on every fixture query',()=>{
  for(const q of data.queries){const w=data.wardrobes.find(w=>w.id===q.wardrobeId);assert.deepEqual(rankOutfits(w.items,q.context,q).outfits,exhaustive(w.items,q.context,q).outfits,q.id);}
});
test('unrecognized context, oversize closet and missing footwear abstain',()=>{
  assert.equal(rankOutfits([],'Unknown').outfits.length,0);
  assert.match(rankOutfits(Array(201).fill({}),'Campus casual').reason,/200/);
  assert.match(rankOutfits([],'Campus casual').reason,/shoes/);
});
test('duplicate ids and invalid metadata never create invalid outfits',()=>{
  const items=[{id:'x',category:'Top',tags:'Campus casual',wears:0},{id:'x',category:'Bottom',tags:'Campus casual',wears:0},{id:'s',category:'Shoes',tags:'Campus casual',wears:0}];
  assert.equal(rankOutfits(items,'Campus casual').outfits.length,0);
  assert.equal(rankOutfits([...items,{id:'b',category:'Bottom',tags:'Campus casual',wears:NaN}],'Campus casual').outfits.length,0);
});
test('outfit validation rejects partial and mixed dress outfits',()=>{
  assert.equal(validShape([{category:'Shoes'}]),false);
  assert.equal(validShape([{category:'Dress'},{category:'Top'},{category:'Shoes'}]),false);
  assert.equal(validShape([{category:'Dress'},{category:'Shoes'}]),true);
});
