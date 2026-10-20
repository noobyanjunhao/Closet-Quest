import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationMemory} from '../src/navigation-memory.js';
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
