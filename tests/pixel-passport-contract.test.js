import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest} from '../src/event/manifest.js';
import {eventConfig} from '../src/event/event-config.js';
import {createDefaultSpec,validateSpec,applyEdit,normalizeNickname,sanitizeNicknameInput,randomNickname,reducer,createInitialState,prefersReducedMotion,isOnePiece,FALLBACK_NICKNAME} from '../src/event/state.js';
import {isPixelPassportPath} from '../src/event/route.js';

test('every preset and the documented contract example validate against the manifest',()=>{
  assert.equal(manifest.presets.length,6);
  for(const preset of manifest.presets)assert.deepEqual(validateSpec(createDefaultSpec({presetId:preset.id})).errors,[]);
  const example={schemaVersion:1,rendererVersion:'cq-pixel-v1',eventId:'campus-demo',nickname:'Pixel Fern',outfit:{presetId:'green-jacket',topId:'jacket',topColor:'#627F62',bottomId:'trousers',bottomColor:'#3D4D5A',shoeId:'sneakers',shoeColor:'#EDE9D9'},appearance:{skinColor:'#C88962',hairId:'short',hairColor:'#3A2C27',headwearId:'none',headwearColor:'#2F5D46',glasses:true},sceneId:'coffee-break',motion:'system'};
  const checked=validateSpec(example);assert.equal(checked.ok,true);assert.deepEqual(checked.spec,example);assert.notEqual(checked.spec.outfit,example.outfit);
  assert.deepEqual(eventConfig.sceneIds,manifest.scenes.map(s=>s.id));assert.equal(eventConfig.rendererVersion,manifest.rendererVersion);
});

test('invalid schema, part, scene, colour, type and unknown fields are rejected',()=>{
  const base=createDefaultSpec();
  const bad=[{...base,schemaVersion:2},{...base,rendererVersion:'other'},{...base,eventId:'elsewhere'},{...base,sceneId:'moon'},{...base,sceneId:'constructor'},{...base,motion:'fast'},{...base,extra:1},{...base,photo:'data:image/png;base64,AA'},
    {...base,outfit:{...base.outfit,topId:'cape'}},{...base,outfit:{...base.outfit,topId:'__proto__'}},{...base,outfit:{...base.outfit,topColor:'#abc'}},{...base,outfit:{...base.outfit,topColor:'#627f62'}},{...base,outfit:{...base.outfit,topColor:'red;background:url(x)'}},{...base,outfit:{...base.outfit,wardrobeId:'w1'}},
    {...base,appearance:{...base.appearance,glasses:'true'}},{...base,appearance:{...base.appearance,glasses:1}},{...base,appearance:{...base.appearance,hairId:'mohawk'}},{...base,appearance:{...base.appearance,email:'a@b.c'}},
    {...base,nickname:'x'.repeat(21)},{...base,nickname:'  padded '},{...base,nickname:'a‮b'},{...base,nickname:''},{...base,outfit:null},{...base,appearance:[]},null,'spec',[]];
  for(const value of bad){const r=validateSpec(value);assert.equal(r.ok,false,JSON.stringify(value));assert.equal(r.spec,null);assert.ok(r.errors.length);}
});

test('nickname normalization keeps bounded visible text and removes unsafe characters',()=>{
  assert.equal(normalizeNickname('  Pixel   Fern  '),'Pixel Fern');
  assert.equal(normalizeNickname('a‮b\u0000c‏d⁦e'),'abcde');
  assert.equal(normalizeNickname(''),FALLBACK_NICKNAME);assert.equal(normalizeNickname('   \n\t '),FALLBACK_NICKNAME);assert.equal(normalizeNickname(42),FALLBACK_NICKNAME);
  assert.equal(Array.from(normalizeNickname('😀'.repeat(30))).length,20);
  assert.equal(normalizeNickname('<b>hi</b>'),'<b>hi</b>');
  assert.equal(normalizeNickname('é'),'é');
  assert.equal(normalizeNickname('小さな冒険'),'小さな冒険');
  assert.equal(sanitizeNicknameInput('Pixel '),'Pixel ');assert.equal(Array.from(sanitizeNicknameInput('y'.repeat(50))).length,20);
  assert.equal(randomNickname(()=>0),'Pixel Fern');assert.equal(validateSpec(createDefaultSpec({nickname:randomNickname(()=>0.999)})).ok,true);
});

test('edits are validated one field at a time and never destroy other choices',()=>{
  let spec=createDefaultSpec();
  assert.equal(applyEdit(spec,'topId','cape'),spec);assert.equal(applyEdit(spec,'topColor','blue'),spec);assert.equal(applyEdit(spec,'glasses','yes'),spec);assert.equal(applyEdit(spec,'wardrobe','x'),spec);assert.equal(applyEdit(spec,'constructor','x'),spec);
  spec=applyEdit(spec,'topColor','#e0705a');assert.equal(spec.outfit.topColor,'#E0705A');
  spec=applyEdit(applyEdit(applyEdit(spec,'hairId','curly'),'glasses',false),'bottomId','skirt');
  const dressed=applyEdit(spec,'topId','dress');assert.equal(isOnePiece(dressed),true);assert.equal(dressed.outfit.bottomId,'skirt');assert.equal(dressed.outfit.bottomColor,spec.outfit.bottomColor);
  assert.equal(applyEdit(dressed,'topId','knit').outfit.bottomId,'skirt');
  for(const scene of manifest.scenes){const moved=applyEdit(dressed,'sceneId',scene.id);assert.deepEqual(moved.outfit,dressed.outfit);assert.deepEqual(moved.appearance,dressed.appearance);assert.equal(moved.nickname,dressed.nickname);assert.equal(validateSpec(moved).ok,true);}
});

test('screen transitions keep the draft, validate before the scene, and reset only event state',()=>{
  let state=createInitialState(()=>0);assert.equal(state.screen,'entry');assert.equal(state.nicknameDraft,'Pixel Fern');
  state=reducer(state,{type:'nickname',value:'   '});state=reducer(state,{type:'start'});
  assert.equal(state.screen,'edit');assert.equal(state.spec.nickname,FALLBACK_NICKNAME);assert.equal(validateSpec(state.spec).ok,true);
  state=reducer(state,{type:'edit',field:'topId',value:'hoodie'});state=reducer(state,{type:'edit',field:'topColor',value:'#3366CC',sampled:true});
  assert.deepEqual(state.undo,{field:'topColor',value:'#627F62'});
  const undone=reducer(state,{type:'undo'});assert.equal(undone.spec.outfit.topColor,'#627F62');assert.equal(undone.undo,null);
  state=reducer(state,{type:'go',screen:'scene'});assert.equal(state.screen,'scene');
  state=reducer(state,{type:'scene',sceneId:'campus-walk'});assert.equal(state.screen,'result');assert.equal(state.spec.outfit.topId,'hoodie');assert.equal(state.spec.outfit.topColor,'#3366CC');
  assert.equal(reducer(state,{type:'scene',sceneId:'moon'}),state);
  const back=reducer(state,{type:'go',screen:'edit'});assert.equal(back.spec,state.spec);assert.equal(reducer(state,{type:'go',screen:'admin'}),state);
  const broken=reducer({...state,spec:{...state.spec,sceneId:'moon'}},{type:'go',screen:'result'});assert.equal(broken.screen,'edit');assert.ok(broken.notice);
  const fresh=reducer(state,{type:'reset',random:()=>0});assert.equal(fresh.screen,'entry');assert.equal(fresh.spec.outfit.topId,'jacket');
  assert.equal(JSON.stringify(state.spec).includes('photo'),false);
});

test('motion preference and exact route matching',()=>{
  const spec=createDefaultSpec();
  assert.equal(prefersReducedMotion(spec,true),true);assert.equal(prefersReducedMotion(spec,false),false);
  assert.equal(prefersReducedMotion(applyEdit(spec,'motion','full'),true),false);assert.equal(prefersReducedMotion(applyEdit(spec,'motion','reduced'),false),true);
  for(const path of ['/event/pixel-passport','/event/pixel-passport/'])assert.equal(isPixelPassportPath(path),true);
  for(const path of ['/','/event','/event/','/event/other','/event/pixel-passport//','/event/pixel-passport/x','/Event/Pixel-Passport','/event/pixel-passport?x=1',undefined,null])assert.equal(isPixelPassportPath(path),false);
});
