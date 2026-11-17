import test from 'node:test';
import assert from 'node:assert/strict';
import {findSavedLook} from '../src/look-continuity.js';
import {prepareBackupImport} from '../src/backup-import.js';
import {newPhotoState,saveLook} from '../src/wardrobe.js';

test('saved confirmation follows persisted combination and occasion, including reordered generated IDs',()=>{
 const state=newPhotoState(),ids=['photo-knit','photo-trousers','photo-sneakers'];
 assert.equal(findSavedLook(state.savedOutfits,ids,'Wedding'),null);
 const saved=saveLook(state,ids,{title:'My wedding start',context:'Wedding'});
 assert.equal(findSavedLook(saved.savedOutfits,[...ids].reverse(),'Wedding').title,'My wedding start');
 assert.equal(findSavedLook(saved.savedOutfits,ids,'Coffee date'),null);
 assert.equal(findSavedLook(saved.savedOutfits,['photo-knit'],'Wedding'),null);
});
test('local backup restoration keeps the active wardrobe namespace without requiring an account',()=>{
 const backup=newPhotoState(),active=newPhotoState();
 const restored=prepareBackupImport(backup,{currentWardrobeId:active.wardrobeId,account:null});
 assert.equal(restored.wardrobeId,active.wardrobeId);assert.notEqual(restored.wardrobeId,backup.wardrobeId);
 assert.deepEqual(restored.items,backup.items);assert.equal(restored.learningEnabled,false);assert.equal(backup.learningEnabled,undefined);
});
test('account backup import binds to the signed-in user and rejects malformed saved collections',()=>{
 const backup=newPhotoState(),id=crypto.randomUUID();
 assert.equal(prepareBackupImport(backup,{currentWardrobeId:backup.wardrobeId,account:{id,cloud:true}}).wardrobeId,id);
 assert.throws(()=>prepareBackupImport({...backup,savedOutfits:'bad'}),/not valid/);
 assert.throws(()=>prepareBackupImport({...backup,items:[{name:'missing id'}]}),/not valid/);
  assert.throws(()=>prepareBackupImport({...backup,savedOutfits:[{title:'broken'}]}),/incomplete/);
  assert.throws(()=>prepareBackupImport({...backup,savedOutfits:[{itemIds:['foreign']}]}),/incomplete/);
});
