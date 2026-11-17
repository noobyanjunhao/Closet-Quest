import test from 'node:test';
import assert from 'node:assert/strict';
import {initialShoppingCategory} from '../src/shopping-selection.js';
test('a new outfit prioritizes its missing piece over an unrelated previous shopping filter',()=>{
  assert.equal(initialShoppingCategory([{category:'Shoes',title:'Dress shoes'}],'Top'),'Shoes');
  assert.equal(initialShoppingCategory([{category:'Shoes'},{category:'Outerwear'}],'Outerwear'),'Outerwear');
});
