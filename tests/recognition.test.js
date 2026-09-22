import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { attributesFromObservation, COLORS, normalizePhoto, PIPELINE_VERSION, runRecognition } from '../server/recognition.js';
import { recognitionPatch } from '../src/wardrobe.js';

const observation=(overrides={})=>({subjectStatus:'single_item',itemType:'Trousers',targetDescription:'The beige trousers centered in the photo.',colorFamily:'Beige',secondaryColors:[],pattern:'Solid',fit:'Regular',materialAppearance:'Smooth woven texture',occasions:['Campus casual'],styleTags:['Classic'],reviewNotes:[],...overrides});
async function photo(options={}) {
  const bytes=await sharp({create:{width:300,height:400,channels:3,background:'#aabbcc',...options}}).composite([{input:Buffer.from('<svg width="20" height="20"><rect width="20" height="20" fill="black"/></svg>')}]).jpeg().toBuffer();
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}
test('specific item types prevent contradictory categories, with consistent representative colors',()=>{
  assert.equal(attributesFromObservation(observation()).category,'Bottom');
  const bag=attributesFromObservation(observation({itemType:'Tote bag'}));assert.equal(bag.category,'Accessory');assert.equal(bag.fit,'Not applicable');
  const shoes=attributesFromObservation(observation({itemType:'Sneakers',subjectStatus:'matching_pair',colorFamily:'White'}));assert.equal(shoes.category,'Shoes');assert.equal(shoes.color,COLORS.White);assert.equal(shoes.colorName,'White');
  assert.equal(shoes.visibleLabelText,'');assert.equal(shoes.reviewRequired,true);
});
test('ambiguous and unrelated images abstain with actionable non-retryable codes',()=>{
  for(const [status,code] of [['not_fashion','NOT_FASHION'],['ambiguous','AMBIGUOUS_ITEM']])assert.throws(()=>attributesFromObservation(observation({subjectStatus:status})),e=>e.code===code&&!e.retryable);
  assert.throws(()=>attributesFromObservation(observation({itemType:'Unknown'})),e=>e.code==='AMBIGUOUS_ITEM');
  assert.throws(()=>attributesFromObservation(observation({subjectStatus:'matching_pair',itemType:'Shirt'})));
  assert.throws(()=>attributesFromObservation(observation({colorFamily:'invented'})));
  assert.throws(()=>attributesFromObservation(observation({occasions:['invented']})));
  assert.throws(()=>attributesFromObservation(observation({visibleLabelText:'Fake Brand'})));
  assert.throws(()=>attributesFromObservation(observation({constructor:'Unexpected field'})));
});
test('scene and input warnings remain visible for human review',()=>{
  const result=attributesFromObservation(observation({subjectStatus:'dominant_item'}),['Small image']);
  assert.ok(result.uncertainty.includes('Small image'));assert.ok(result.uncertainty.some(s=>s.includes('Other items')));
  const unknown=attributesFromObservation(observation({colorFamily:'Unknown'}));assert.ok(unknown.uncertainty.some(s=>s.includes('manually')));
});
test('decoder validates real image bytes and dimensions before any inference',async()=>{
  await assert.rejects(normalizePhoto('data:image/jpeg;base64,bm90LWEtcGhvdG8='),e=>e.code==='INVALID_IMAGE');
  await assert.rejects(normalizePhoto((await photo()).replace('image/jpeg','image/png')),e=>e.code==='INVALID_IMAGE');
  await assert.rejects(normalizePhoto(await photo({width:32})),e=>e.code==='INVALID_IMAGE');
  await assert.rejects(normalizePhoto('https://example.com/photo.jpg'),e=>e.code==='INVALID_IMAGE');
  const result=await normalizePhoto(await photo({width:1200,height:1600}));assert.equal(result.height,1000);assert.equal(result.width,750);assert.equal(result.inputSha256.length,64);
  const metadata=await sharp(Buffer.from(result.base64,'base64')).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.format,'jpeg');
});

test('optional target crop validates boundaries and preserves input provenance',async()=>{
  const image=await photo(),crop={x:0.25,y:0.25,width:0.5,height:0.5};
  const full=await normalizePhoto(image),cropped=await normalizePhoto(image,{crop});
  assert.equal(cropped.inputSha256,full.inputSha256);assert.notEqual(cropped.normalizedSha256,full.normalizedSha256);
  assert.equal(cropped.width,150);assert.equal(cropped.height,200);
  for(const invalid of [{...crop,x:0.9},{...crop,width:0.001},{...crop,x:NaN}])await assert.rejects(normalizePhoto(image,{crop:invalid}),error=>error.code==='INVALID_CROP');
  const result=await runRecognition(image,async()=>({data:observation(),model:'test'}),{crop});
  assert.deepEqual(result.pipeline.crop,crop);
});
test('pipeline uses normalized pixels, bounded schema and versioned provenance',async()=>{
  const stages=[];const result=await runRecognition(await photo(),async(schema,system,prompt,image,options)=>{
    assert.equal(options.temperature,0);assert.equal(options.seed,42);assert.ok(schema.properties.itemType.enum.includes('Tote bag'));assert.ok(!schema.properties.category);assert.ok(!schema.properties.visibleLabelText);assert.ok(image.length>0);assert.match(prompt,/schema/);
    return {data:observation(),model:'test-model',latencyMs:1,tokens:10};
  },{onStage:s=>stages.push(s)});
  assert.deepEqual(stages,['preparing','recognizing','validating']);assert.equal(result.pipeline.version,PIPELINE_VERSION);assert.equal(result.pipeline.promptSha256.length,64);assert.equal(result.pipeline.stages.length,3);assert.equal(result.data.category,'Bottom');
});

test('uniform pixels are rejected before inference without rejecting pale garment edges',async()=>{
  let calls=0;
  for(const background of ['#ffffff','#000000','#aabbcc']) {
    const bytes=await sharp({create:{width:400,height:400,channels:3,background}}).png().toBuffer();
    await assert.rejects(runRecognition(`data:image/png;base64,${bytes.toString('base64')}`,()=>{calls++;}),e=>e.code==='EMPTY_IMAGE'&&!e.retryable);
  }
  assert.equal(calls,0);
  const pale=await sharp({create:{width:400,height:400,channels:3,background:'#ffffff'}}).composite([{input:Buffer.from('<svg width="200" height="300"><rect width="200" height="300" fill="#f4f4f4"/></svg>')}]).png().toBuffer();
  await normalizePhoto(`data:image/png;base64,${pale.toString('base64')}`);
});
test('invalid or cancelled input never invokes the provider; AI application preserves manually entered labels',async()=>{
  let calls=0;const provider=async()=>{calls++;return{data:observation()};};
  await assert.rejects(runRecognition('bad',provider));
  const controller=new AbortController();controller.abort();await assert.rejects(runRecognition(await photo(),provider,{signal:controller.signal}));assert.equal(calls,0);
  const manual={visibleLabelText:'Label transcribed by user'};
  assert.equal({...manual,...recognitionPatch({data:attributesFromObservation(observation())})}.visibleLabelText,manual.visibleLabelText);
});
