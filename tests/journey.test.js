import test from 'node:test';
import assert from 'node:assert/strict';
import { beginFavorite, claimFavorite, closetCheck, daysSinceWear, favoriteProgress, matchInspiration } from '../src/journey.js';
import { roleplayState } from '../src/roleplay.js';
import { removePlainBackdrop } from '../src/background.js';
import { validateInspiration } from '../server/inspiration.js';

test('closet check uses dates, respects keep, and does not invent unknown wear history',()=>{
  const now=Date.parse('2026-09-29T12:00:00Z');
  assert.equal(daysSinceWear({wears:8},now),null);
  assert.equal(daysSinceWear({wears:0,addedAt:'2026-09-01T12:00:00Z'},now),28);
  const old={id:'old',wears:15,lastWorn:'2026-06-01T12:00:00Z'};
  assert.deepEqual(closetCheck([old,{...old,id:'kept',keepUntil:'2026-10-01'},{...old,id:'review',needsReview:true}],now).map(i=>i.id),['old']);
});
test('three-outfit reward requires distinct owned complete bases and can only be claimed once',()=>{
  let s=beginFavorite(roleplayState(),'photo-blazer');
  const ids=(top,bottom,extra=[])=>[top,bottom,'photo-sneakers','photo-blazer',...extra];
  s.savedOutfits=[{itemIds:ids('photo-tee','photo-denim')},{itemIds:ids('photo-tee','photo-denim',['photo-tote'])},{itemIds:['photo-blazer','photo-tee']}];
  assert.equal(favoriteProgress(s).length,1);
  assert.throws(()=>claimFavorite(s),/three/);
  s.savedOutfits.push({itemIds:ids('photo-knit','photo-denim')},{itemIds:ids('photo-knit','photo-trousers')});
  assert.equal(favoriteProgress(s).length,3);
  const done=claimFavorite(s);assert.equal(done.xp,150);assert.throws(()=>claimFavorite(done),/already/);
  const removed={...s,items:s.items.filter(i=>i.id!=='photo-knit')};assert.equal(favoriteProgress(removed).length,1);
});
test('inspiration never invents owned items and excludes unreviewed pieces',()=>{
  const result=matchInspiration([{category:'Outerwear',description:'navy blazer',color:'navy'},{category:'Dress',description:'dress',color:'red'}],roleplayState().items);
  assert.equal(result[0].item.id,'photo-blazer');assert.equal(result[1].item,null);
  assert.equal(matchInspiration([{category:'Accessory',description:'black belt',color:'black'}],roleplayState().items)[0].item,null);
  assert.equal(matchInspiration([{category:'Top',description:'tee',color:'white'}],[{id:'pending',category:'Top',needsReview:true}])[0].item,null);
  assert.throws(()=>validateInspiration({summary:'look',pieces:[{category:'Invented',color:'red',description:'shoe'}]}),/unclear/);
});
test('plain backdrop removal preserves disconnected subject pixels and refuses blank input',()=>{
  const pixels=new Uint8ClampedArray(10*10*4).fill(255);
  for(let y=2;y<8;y++)for(let x=2;x<8;x++){const p=(y*10+x)*4;pixels[p]=30;pixels[p+1]=50;pixels[p+2]=70;}
  const result=removePlainBackdrop(pixels,10,10);
  assert.equal(result[3],0);assert.equal(result[(5*10+5)*4+3],255);assert.equal(pixels[3],255);
  assert.throws(()=>removePlainBackdrop(new Uint8ClampedArray(400).fill(255),10,10),/similar/);
});
