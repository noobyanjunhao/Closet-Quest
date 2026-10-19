import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageNavigator } from '../src/page-motion.js';

test('navigation is immediate without View Transitions or with reduced motion', () => {
  for (const reduced of [false,true]) {
    const destinations=[];
    createPageNavigator({commit: value=>destinations.push(value),reducedMotion:()=>reduced})('Closet');
    assert.deepEqual(destinations,['Closet']);
  }
  const destinations=[];
  createPageNavigator({commit:value=>destinations.push(value),startTransition:()=>{throw new Error('Should not animate');},reducedMotion:()=>true})('Outfits');
  assert.deepEqual(destinations,['Outfits']);
});

test('rapid navigation ignores a superseded pending update', async () => {
  const updates=[], destinations=[];
  let skipped=0;
  const navigate=createPageNavigator({commit:value=>destinations.push(value),reducedMotion:()=>false,startTransition:update=>{
    updates.push(update);
    return {skipTransition:()=>skipped++,ready:Promise.resolve(),finished:Promise.resolve()};
  }});
  navigate('Outfits'); navigate('Lookbook');
  updates[1](); updates[0]();
  assert.equal(skipped,1);
  assert.deepEqual(destinations,['Lookbook']);
});

test('animation setup failures fall back to working navigation', () => {
  const destinations=[];
  createPageNavigator({commit:value=>destinations.push(value),reducedMotion:()=>false,startTransition:()=>{throw new Error('Unavailable');}})('Memory');
  assert.deepEqual(destinations,['Memory']);
});
