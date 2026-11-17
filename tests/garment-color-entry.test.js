import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHexColor} from '../src/garment-colors.js';
import {pixelGarmentKind} from '../src/garment-display.js';

test('hex entry accepts complete RGB colors and rejects incomplete or unsafe drafts',()=>{
  assert.equal(parseHexColor('#A1b2C3'),'#a1b2c3');
  assert.equal(parseHexColor('#000000'),'#000000');
  for(const draft of ['',null,'#12','#abc','123456','#12345g','#1234567','red','url(x)'])assert.equal(parseHexColor(draft),null);
});
test('headwear gets a specific icon while other accessories and cap-sleeve tops keep their category',()=>{
  assert.equal(pixelGarmentKind({category:'Accessory',name:'Navy baseball cap'}),'Cap');
  assert.equal(pixelGarmentKind({category:'Accessory',itemType:'Bucket hat',name:'Blue piece'}),'Hat');
  assert.equal(pixelGarmentKind({category:'Accessory',name:'Wool beanie'}),'Hat');
  assert.equal(pixelGarmentKind({category:'Accessory',name:'Everyday tote'}),'Accessory');
  assert.equal(pixelGarmentKind({category:'Top',name:'Cap sleeve blouse'}),'Top');
  assert.equal(pixelGarmentKind({category:'Accessory',name:'Capsule crossbody'}),'Accessory');
  assert.equal(pixelGarmentKind({category:'invalid'}),'Top');
});
