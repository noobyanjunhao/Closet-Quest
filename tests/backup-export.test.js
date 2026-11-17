import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBackupExport} from '../src/backup-export.js';

const cloud=id=>`/api/cloud/photos/${id.repeat(64)}.jpg`;
const state={profile:'Test',wardrobeId:'local-owner',xp:42,completed:[],submissions:[],items:[{id:'cap',name:'Uploaded cap',image:'data:image/png;base64,YQ=='}],savedOutfits:[]};

test('backup text preserves every local photo and garment without network requests or source mutations',async()=>{
 const result=await prepareBackupExport(state,{readImage(){throw Error('Must not fetch embedded photos');}});
 assert.deepEqual(JSON.parse(JSON.stringify(result.state)),state);
 assert.notEqual(result.state,state);assert.equal(result.unavailablePhotos,0);
 result.state.items[0].name='Changed export';assert.equal(state.items[0].name,'Uploaded cap');
});

test('a failed cloud photo keeps its link without discarding other recovered originals and cutouts',async()=>{
 const source={...state,items:[{id:'a',image:cloud('a'),originalImage:cloud('a'),cutoutImage:'data:image/png;base64,Yg=='},{id:'b',image:cloud('b')}]};
 const calls=[];
 const result=await prepareBackupExport(source,{readImage:async(url,{preserve,signal})=>{calls.push(url);assert.equal(preserve,true);assert.ok(signal);if(url===cloud('b'))throw Error('Unavailable');return 'data:image/jpeg;base64,Yw==';}});
 assert.equal(calls.length,2,'Repeated photo links are fetched once.');
 assert.equal(result.recoveredPhotos,1);assert.equal(result.unavailablePhotos,1);
 assert.equal(result.state.items[0].image,'data:image/jpeg;base64,Yw==');assert.equal(result.state.items[0].originalImage,result.state.items[0].image);
 assert.equal(result.state.items[0].cutoutImage,source.items[0].cutoutImage);assert.equal(result.state.items[1].image,cloud('b'));
 assert.equal(source.items[0].image,cloud('a'));
});

test('overall backup deadline returns despite a stalled reader and late completion cannot change exported data',async()=>{
 let release,aborted=false;
 const source={...state,items:[{id:'a',image:cloud('a')},{id:'b',image:cloud('b')}]};
 const result=await prepareBackupExport(source,{timeoutMs:20,readImage:async(url,{signal})=>{
  if(url===cloud('a'))return 'data:image/jpeg;base64,Yw==';
  signal.addEventListener('abort',()=>aborted=true);
  return new Promise(resolve=>{release=resolve;});
 }});
 assert.equal(aborted,true);assert.equal(result.recoveredPhotos,1);assert.equal(result.unavailablePhotos,1);
 const exported=JSON.stringify(result.state);release('data:image/jpeg;base64,bGF0ZQ==');await Promise.resolve();await Promise.resolve();
 assert.equal(JSON.stringify(result.state),exported);
});

test('cloud backup downloads bound concurrency and reject invalid image responses',async()=>{
 let active=0,peak=0;
 const source={...state,items:Array.from({length:8},(_,i)=>({id:String(i),image:cloud(String(i))}))};
 const result=await prepareBackupExport(source,{concurrency:2,readImage:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return '<html>failed</html>';}});
 assert.equal(peak,2);assert.equal(result.recoveredPhotos,0);assert.equal(result.unavailablePhotos,8);
 assert.deepEqual(result.state,source);
});
