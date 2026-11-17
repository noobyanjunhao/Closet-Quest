import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationMemory,readNavigationSnapshot,writeNavigationSnapshot} from '../src/navigation-memory.js';
import {createPageNavigator} from '../src/page-motion.js';

test('tabs remember independent positions, and returning does not repeat entrance',()=>{
 const memory=createNavigationMemory();
 assert.deepEqual(memory.move('Outfits',{x:0,y:735}),{changed:true,returning:false,position:{x:0,y:0}});
 assert.deepEqual(memory.move('Lookbook',{x:0,y:186}),{changed:true,returning:false,position:{x:0,y:0}});
 assert.deepEqual(memory.move('Closet',{x:0,y:291}),{changed:true,returning:true,position:{x:0,y:735}});
 assert.deepEqual(memory.move('Outfits',{x:0,y:746}),{changed:true,returning:true,position:{x:0,y:186}});
 assert.deepEqual(memory.move('Closet'),{changed:true,returning:true,position:{x:0,y:746}});
});
test('tapping the active tab does not replace its saved position or reset scroll',()=>{
 const memory=createNavigationMemory();
 assert.deepEqual(memory.move('Closet',{y:300}),{changed:false});
 memory.move('Outfits',{y:620});
 assert.deepEqual(memory.move('Closet').position,{x:0,y:620});
});
test('a superseded animated destination cannot overwrite navigation memory',()=>{
 const updates=[],memory=createNavigationMemory();
 const navigate=createPageNavigator({commit:page=>memory.move(page,{y:410}),reducedMotion:()=>false,startTransition:update=>{
  updates.push(update);return {skipTransition(){},ready:Promise.resolve(),finished:Promise.resolve()};
 }});
 navigate('Outfits');navigate('Lookbook');updates[1]();updates[0]();
 assert.equal(memory.current,'Lookbook');
 assert.equal(memory.move('Outfits').returning,false);
 assert.equal(memory.move('Closet').position.y,410);
});
test('returning to the current tab cancels an older navigation still awaiting animation',()=>{
 const updates=[],memory=createNavigationMemory();
 const navigate=createPageNavigator({commit:page=>memory.move(page,{y:220}),reducedMotion:()=>false,startTransition:update=>{
  updates.push(update);return {skipTransition(){},ready:Promise.resolve(),finished:Promise.resolve()};
 }});
 navigate('Outfits');navigate('Closet');updates[1]();updates[0]();
 assert.equal(memory.current,'Closet');
 assert.equal(memory.move('Outfits').returning,false);
});

test('reload restores the selected page and each prior position without storing private content',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const memory=createNavigationMemory();memory.move('Outfits',{y:420});memory.move('Lookbook',{y:120});memory.checkpoint({y:350});
 assert.equal(writeNavigationSnapshot(storage,'user-a',memory),true);
 const restored=createNavigationMemory('Closet',readNavigationSnapshot(storage,'user-a'));
 assert.equal(restored.current,'Lookbook');assert.equal(restored.position.y,350);assert.equal(restored.move('Closet').position.y,420);
 assert.equal(readNavigationSnapshot(storage,'user-b'),null);
 assert.deepEqual(Object.keys(JSON.parse(values.get('user-a'))).sort(),['current','positions','version']);
});
test('invalid storage and unknown destinations cannot break navigation or create arbitrary pages',()=>{
 const badStorage={getItem:()=>'{bad',setItem:()=>{throw Error('full');}};
 assert.equal(readNavigationSnapshot(badStorage,'nav'),null);
 const memory=createNavigationMemory('Closet',{current:'invented',positions:{Closet:{y:-2},Outfits:{y:Infinity},invented:{y:500}}});
 assert.equal(memory.current,'Closet');assert.equal(memory.position.y,0);assert.deepEqual(memory.move('invented'),{changed:false});
 assert.equal(writeNavigationSnapshot(badStorage,'nav',memory),false);
});
