import test from 'node:test';
import assert from 'node:assert/strict';
import {featuredGarments,garmentPresentation} from '../src/garment-display.js';
import {revealOnShelf,nextShelfPage,savedShelfPosition} from '../src/closet-navigation.js';

test('the personal edit prioritizes uploaded photos without reordering or mutating the closet',()=>{
  const items=[
    {id:'demo',sampleId:'blazer',image:'photos/blazer.jpg',category:'Outerwear',wears:0},
    {id:'tee',image:'upload-tee.jpg',category:'Top',wears:8},
    {id:'jeans',image:'upload-jeans.jpg',category:'Bottom',wears:5},
    {id:'shoes',image:'upload-shoes.jpg',category:'Shoes',wears:2},
    {id:'pixel',displayMode:'pixel',image:'upload-hidden.jpg',category:'Dress'}
  ];
  const before=structuredClone(items),featured=featuredGarments(items);
  assert.equal(featured.length,3);
  assert.ok(featured.every(item=>!item.sampleId&&item.id!=='pixel'));
  assert.equal(new Set(featured.map(item=>item.category)).size,3);
  assert.deepEqual(items,before);
  assert.deepEqual(featuredGarments([]),[]);
});

test('the displayed provenance follows the selected view, keeping sample imagery explicit',()=>{
  const item={image:'photo.jpg',cutoutImage:'cutout.png'};
  assert.equal(garmentPresentation(item),'Your cutout');
  assert.equal(garmentPresentation({...item,displayMode:'photo'}),'Your photo');
  assert.equal(garmentPresentation({...item,sampleId:'tee',displayMode:'photo'}),'Sample photo');
  assert.equal(garmentPresentation({...item,sampleId:'tee'}),'Sample cutout');
  assert.equal(garmentPresentation({...item,displayMode:'pixel'}),'Pixel icon');
  assert.equal(garmentPresentation({}),'Pixel icon');
});

test('keyboard-selected thumbnails are revealed with the smallest shelf movement',()=>{
  assert.equal(revealOnShelf({left:100,width:320,itemLeft:130,itemWidth:80}),100);
  assert.equal(revealOnShelf({left:100,width:320,itemLeft:40,itemWidth:80}),40);
  assert.equal(revealOnShelf({left:100,width:320,itemLeft:440,itemWidth:80}),200);
  assert.equal(revealOnShelf({left:0,width:320,itemLeft:0,itemWidth:80}),0);
});

test('saved looks page to the end then wrap, with both mobile and desktop positions preserved',()=>{
  assert.equal(nextShelfPage({position:0,viewport:300,content:700}),240);
  assert.equal(nextShelfPage({position:240,viewport:300,content:700}),400);
  assert.equal(nextShelfPage({position:400,viewport:300,content:700}),0);
  assert.equal(nextShelfPage({position:0,viewport:300,content:200}),0);
  assert.deepEqual(savedShelfPosition(175),{top:175,left:0});
  assert.deepEqual(savedShelfPosition({top:175,left:240}),{top:175,left:240});
  assert.deepEqual(savedShelfPosition(null),{top:0,left:0});
});
