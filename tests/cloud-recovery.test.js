import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPendingCloset,openCloudVersion,pendingClosetKey} from '../src/cloud-recovery.js';

const owner='11111111-1111-4111-a111-111111111111',other='22222222-2222-4222-a222-222222222222';
const closet={wardrobeId:owner,profile:'Owner',items:[{id:'cap',name:'My cap'}],completed:[],submissions:[],xp:0};
function memory(entries={}) {
 const values=new Map(Object.entries(entries)),read=[];
 return {values,read,getItem(key){read.push(key);return values.get(key)??null;},removeItem(key){values.delete(key);}};
}

test('pending recovery reads only the authenticated owner and remains exportable without a network request',()=>{
 const pending={state:closet,revision:3},store=memory({[pendingClosetKey(owner)]:JSON.stringify(pending),[pendingClosetKey(other)]:'private other data'});
 const recovered=inspectPendingCloset(store,owner);
 assert.equal(recovered.error,null);assert.equal(recovered.pending.revision,3);assert.equal(recovered.backup.items[0].name,'My cap');
 assert.deepEqual(store.read,[pendingClosetKey(owner)]);assert.equal(store.values.size,2);
});

test('malformed or foreign pending data is preserved and never silently replaced by an empty closet',()=>{
 for(const raw of ['{broken',JSON.stringify({state:closet,revision:-1}),JSON.stringify({state:{...closet,wardrobeId:other},revision:2})]){
  const store=memory({[pendingClosetKey(owner)]:raw}),result=inspectPendingCloset(store,owner);
  assert.equal(result.pending,null);assert.match(result.error,/not been overwritten/);assert.ok(result.backup);
  assert.equal(store.values.get(pendingClosetKey(owner)),raw);
 }
});

test('opening a conflicting cloud copy requires export and validates the copy before removing pending changes',()=>{
 const raw=JSON.stringify({state:closet,revision:3}),store=memory({[pendingClosetKey(owner)]:raw});
 assert.throws(()=>openCloudVersion(store,owner,{state:closet,revision:4}),/Export/);
 for(const remote of [{state:null,revision:4},{state:{...closet,wardrobeId:other},revision:4},{state:closet,revision:-1}]){
  assert.throws(()=>openCloudVersion(store,owner,remote,{exported:true}));
  assert.equal(store.values.get(pendingClosetKey(owner)),raw);
 }
 const selected=openCloudVersion(store,owner,{state:{...closet,profile:'Cloud'},revision:4},{exported:true});
 assert.equal(selected.state.profile,'Cloud');assert.equal(selected.revision,4);assert.equal(selected.resume,false);
 assert.equal(store.values.has(pendingClosetKey(owner)),false);
});

test('unavailable browser storage fails closed instead of starting a fresh closet',()=>{
 assert.throws(()=>inspectPendingCloset({getItem(){throw Error('denied');}},owner),/storage is unavailable/);
});
