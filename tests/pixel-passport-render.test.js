import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest} from '../src/event/manifest.js';
import {createDefaultSpec,applyEdit} from '../src/event/state.js';
import {buildAvatarDrawPlan,poseForScene,REST_POSE,SPRITE_W,SPRITE_H,OUTLINE,darken} from '../src/event/render-avatar.js';
import {buildScenePlan,SCENE_W,SCENE_H} from '../src/event/scenes.js';
import {describeCard,drawCard,CARD_W,CARD_H,CARD_LAYOUT,CARD_FILENAME,pixelTextWidth} from '../src/event/render-card.js';
import {containRect,mapPointToSource,medianColor,rgbToHex} from '../src/event/palette.js';
import {createPhotoStore,createEventCamera,checkPhotoFile,fitWithin,eventCameraMessage,PHOTO_LIMITS,PhotoError} from '../src/event/capture.js';
import {createExportStore,renderCardBlob,canShareFile,shareCard,requestDownload} from '../src/event/export-card.js';

const colors=plan=>new Set(plan.rects.map(r=>r.color));
const area=(plan,color)=>plan.rects.filter(r=>r.color===color).reduce((n,r)=>n+r.w*r.h,0);
const inBounds=(rects,w,h)=>rects.every(r=>r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=w&&r.y+r.h<=h&&/^#[0-9A-F]{6}$/i.test(r.color));

test('every legal part combination renders inside the 64 x 80 sprite in every pose',()=>{
  let count=0;const base=createDefaultSpec();
  for(const top of manifest.tops)for(const bottom of manifest.bottoms)for(const shoe of manifest.shoes)for(const hair of manifest.hair)for(const headwear of manifest.headwear){
    let spec=base;for(const [f,v] of [['topId',top.id],['bottomId',bottom.id],['shoeId',shoe.id],['hairId',hair.id],['headwearId',headwear.id]])spec=applyEdit(spec,f,v);
    for(const scene of manifest.scenes)for(const frame of [null,3]){const plan=buildAvatarDrawPlan(spec,poseForScene(scene.reveal,frame));assert.ok(inBounds(plan.rects,SPRITE_W,SPRITE_H));assert.ok(plan.rects.length>50);count++;}
  }
  assert.equal(count,5*3*3*7*4*6);
});

test('the draw plan shows the chosen outfit and keeps appearance through every reveal frame',()=>{
  const spec=applyEdit(applyEdit(createDefaultSpec({presetId:'navy-knit'}),'topColor','#12AB34'),'bottomColor','#AB1234');
  const rest=buildAvatarDrawPlan(spec,REST_POSE);
  for(const c of ['#12AB34','#AB1234',spec.outfit.shoeColor,spec.appearance.skinColor,spec.appearance.hairColor,OUTLINE])assert.ok(colors(rest).has(c),c);
  const band=buildAvatarDrawPlan(spec).rects.filter(r=>r.y<17).length;assert.ok(band>10);
  const withGlasses=applyEdit(spec,'glasses',true);
  for(const scene of manifest.scenes)for(let frame=0;frame<16;frame++){
    const plan=buildAvatarDrawPlan(withGlasses,poseForScene(scene.reveal,frame));
    for(const c of ['#12AB34','#AB1234',spec.appearance.hairColor,darken(spec.appearance.headwearColor,0.22)])assert.ok(colors(plan).has(c),`${scene.id} ${frame} ${c}`);
    assert.ok(plan.rects.length>buildAvatarDrawPlan(spec,poseForScene(scene.reveal,frame)).rects.length,'glasses stay on');
  }
  const dress=applyEdit(spec,'topId','dress');assert.equal(colors(buildAvatarDrawPlan(dress)).has('#AB1234'),false);assert.equal(dress.outfit.bottomColor,'#AB1234');
  const scarf=applyEdit(applyEdit(spec,'headwearId','headscarf'),'hairColor','#FF00FF');assert.equal(colors(buildAvatarDrawPlan(scarf)).has('#FF00FF'),false);
  assert.ok(area(buildAvatarDrawPlan(applyEdit(spec,'bottomId','shorts')),'#AB1234')<area(rest,'#AB1234'));
  assert.throws(()=>buildAvatarDrawPlan({...spec,rendererVersion:'cq-pixel-v0'}));
  assert.deepEqual(buildAvatarDrawPlan(spec).rects,buildAvatarDrawPlan(JSON.parse(JSON.stringify(spec))).rects);
});

test('scenes render in bounds, animate, and reject unknown ids',()=>{
  for(const scene of manifest.scenes){
    const still=buildScenePlan(scene.id,null);assert.ok(inBounds([...still.back,...still.front],SCENE_W,SCENE_H));assert.ok(still.back.length>40);
    const frames=new Set();for(let f=0;f<16;f++){const p=buildScenePlan(scene.id,f);assert.ok(inBounds([...p.back,...p.front],SCENE_W,SCENE_H));frames.add(JSON.stringify(p));}
    assert.ok(frames.size>3,scene.id);
    assert.ok(scene.caption.length<=48&&scene.stamp.length<=15);assert.ok(pixelTextWidth(scene.stamp,3)<=CARD_LAYOUT.stamp.w-28);
  }
  assert.throws(()=>buildScenePlan('moon'));assert.throws(()=>buildScenePlan('toString'));
});

function fakeContext(log){
  const noop=()=>{};
  return new Proxy({measureText:text=>({width:String(text).length*40}),fillRect:(x,y,w,h)=>log.rects.push([x,y,w,h]),fillText:(text,x,y)=>log.text.push({text,x,y}),drawImage:()=>log.images++},{get:(t,k)=>k in t?t[k]:noop,set:()=>true});
}

test('the card is 1080 x 1350, stays in bounds, and carries only the character, nickname, scene and caption',()=>{
  assert.deepEqual([CARD_W,CARD_H],[1080,1350]);assert.equal(CARD_FILENAME,'closet-quest-pixel-passport.png');
  const spec=createDefaultSpec({nickname:'W'.repeat(20),sceneId:'after-talks'}),log={rects:[],text:[],images:0};
  drawCard(fakeContext(log),spec,{config:{displayName:'',displayDate:''}});
  assert.equal(log.images,0,'no photograph or external image is ever drawn');
  const info=describeCard(spec,{});assert.equal(info.caption,'Presentation complete. Snack quest unlocked.');assert.equal(info.eventLabel,'');
  assert.equal(describeCard(spec,{displayName:'Demo Day',displayDate:''}).eventLabel,'Demo Day');
  const texts=log.text.map(t=>t.text);assert.ok(texts.some(t=>t.endsWith('…')),'an over-wide nickname is shortened, not clipped');assert.ok(texts.includes('Same clothes. New quest.'));
  const name=texts.find(t=>t.endsWith('…'));assert.ok(name.length*40<=CARD_LAYOUT.text.nameMax);
  for(const t of log.text)assert.ok(t.x>=CARD_LAYOUT.paper.x&&t.x<=CARD_LAYOUT.text.right&&t.y<=CARD_LAYOUT.paper.y+CARD_LAYOUT.paper.h);
  const short={rects:[],text:[],images:0};drawCard(fakeContext(short),createDefaultSpec({nickname:'Pixel Fern'}),{});assert.ok(short.text.map(t=>t.text).includes('Pixel Fern'));
});

test('tap mapping respects letterboxing, edges and clamping; sampling uses a median patch',()=>{
  assert.deepEqual(containRect(200,200,100,50),{x:0,y:50,w:200,h:100});assert.deepEqual(containRect(200,100,50,100),{x:75,y:0,w:50,h:100});assert.deepEqual(containRect(0,0,10,10),{x:0,y:0,w:0,h:0});
  const box={boxW:200,boxH:200,srcW:100,srcH:50};
  assert.deepEqual(mapPointToSource({px:100,py:100,...box}),{x:50,y:25,inside:true});
  assert.equal(mapPointToSource({px:100,py:20,...box}).inside,false);assert.deepEqual(mapPointToSource({px:200,py:150,...box}),{x:99,y:49,inside:true});
  assert.deepEqual(mapPointToSource({px:-50,py:-50,...box}),{x:0,y:0,inside:false});assert.deepEqual(mapPointToSource({px:0,py:50,...box}),{x:0,y:0,inside:true});
  const w=9,h=9,data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)data.set([30,100,200,255],i*4);
  data.set([255,255,255,255],(4*w+4)*4);
  assert.equal(medianColor(data,w,h,4,4,3),'#1E64C8');assert.equal(medianColor(data,w,h,0,0,3),'#1E64C8');assert.equal(medianColor(data,w,h,8,8,3),'#1E64C8');
  assert.equal(medianColor(new Uint8ClampedArray(w*h*4),w,h,4,4),null);assert.equal(rgbToHex(300,-4,15.6),'#FF0010');
});

const fakeCanvas=log=>(width,height)=>({width,height,getContext:()=>({drawImage:(...a)=>log.push(a),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(255)})})});
const file=(type,size)=>({type,size});

test('photo bounds: type, 8 MB, pixel limit, downscale to 1024, and decode failure all recover',async()=>{
  assert.equal(checkPhotoFile(file('image/jpeg',1000)),'');assert.match(checkPhotoFile(file('image/heic',1000)),/not supported/);assert.match(checkPhotoFile(file('image/png',PHOTO_LIMITS.maxBytes+1)),/8 MB/);assert.match(checkPhotoFile(null),/could not be read/);
  assert.deepEqual(fitWithin(4000,3000,1024),{width:1024,height:768});assert.deepEqual(fitWithin(300,200,1024),{width:300,height:200});assert.deepEqual(fitWithin(5000,2,1024),{width:1024,height:1});
  const draws=[];let closed=0;
  const store=createPhotoStore({createCanvas:fakeCanvas(draws),decode:async f=>{if(f.fail)throw Error('bad');return{width:f.w,height:f.h,close:()=>closed++};}});
  const handle=await store.load({...file('image/jpeg',10),w:4000,h:3000});
  assert.deepEqual([handle.width,handle.height],[1024,768]);assert.equal(closed,1,'full-resolution bitmap is released');assert.equal(handle.sample(5,5),'#FFFFFF');assert.equal(store.current(),handle);
  await assert.rejects(store.load({...file('image/jpeg',10),w:9000,h:9000}),PhotoError);assert.equal(closed,2);
  await assert.rejects(store.load({...file('image/png',10),fail:true}),/could not be opened/);await assert.rejects(store.load(file('image/gif',10)),PhotoError);
  assert.equal(store.current(),handle,'a failed photo keeps the previous reference');
  store.dispose();assert.equal(store.current(),null);assert.equal(handle.sample(5,5),null);assert.equal(handle.canvas.width,1);
});

test('a late decode never replaces a newer photo or returns after reset',async()=>{
  const gates=[],store=createPhotoStore({createCanvas:fakeCanvas([]),decode:f=>new Promise(resolve=>gates.push(()=>resolve({width:f.w,height:100,close(){}})))});
  const slow=store.load({...file('image/jpeg',1),w:111}),fast=store.load({...file('image/jpeg',1),w:222});
  gates[1]();const second=await fast;gates[0]();assert.equal(await slow,null);assert.equal(store.current(),second);assert.equal(second.width,222);
  const pending=store.load({...file('image/jpeg',1),w:333});store.dispose();gates[2]();assert.equal(await pending,null);assert.equal(store.current(),null);
});

const track=()=>({stopped:false,stop(){this.stopped=true;}});
const stream=()=>{const tracks=[track()];return{tracks,getTracks:()=>tracks};};

test('camera asks for video only, stops on demand, and ignores late or timed-out starts',async()=>{
  const requests=[],a=stream();
  const camera=createEventCamera({getUserMedia:async c=>{requests.push(c);return a;}});
  assert.equal(await camera.start('user'),a);assert.equal(requests[0].audio,false);assert.equal(requests[0].video.facingMode.ideal,'user');assert.equal(camera.active(),a);
  camera.stop();assert.equal(a.tracks[0].stopped,true);assert.equal(camera.active(),null);
  const gates=[],late=createEventCamera({getUserMedia:()=>new Promise(resolve=>gates.push(resolve))});
  const first=late.start(),s1=stream();late.stop();gates[0](s1);assert.equal(await first,null);assert.equal(s1.tracks[0].stopped,true);
  const p1=late.start('environment'),p2=late.start('user'),s2=stream(),s3=stream();gates[2](s3);gates[1](s2);
  assert.equal(await p1,null);assert.equal(await p2,s3);assert.equal(s2.tracks[0].stopped,true);assert.equal(s3.tracks[0].stopped,false);late.stop();assert.equal(s3.tracks[0].stopped,true);
  let fire,release;const timed=createEventCamera({getUserMedia:()=>new Promise(resolve=>{release=resolve;})},{setTimer:fn=>{fire=fn;return 1;},clearTimer(){}});
  const waiting=timed.start();fire();await assert.rejects(waiting,{name:'TimeoutError'});const s4=stream();release(s4);await new Promise(r=>setImmediate(r));assert.equal(s4.tracks[0].stopped,true,'a stream granted after the timeout is stopped');assert.equal(timed.active(),null);
  await assert.rejects(createEventCamera(undefined).start(),{name:'NotFoundError'});
  const denied=createEventCamera({getUserMedia:async()=>{throw Object.assign(Error('no'),{name:'NotAllowedError'});}});await assert.rejects(denied.start(),{name:'NotAllowedError'});
  for(const name of ['NotAllowedError','NotFoundError','NotReadableError','TimeoutError','Whatever'])assert.match(eventCameraMessage({name}),/skip the photo/);
});

test('export keeps one live handle, handles a null blob, and sharing failure leaves options',async()=>{
  const live=new Set();let n=0;const urlApi={createObjectURL:()=>{const u=`blob:${++n}`;live.add(u);return u;},revokeObjectURL:u=>live.delete(u)};
  const store=createExportStore(urlApi),a=store.set({}),b=store.set({});assert.deepEqual([...live],[b.url]);assert.notEqual(a.url,b.url);assert.equal(store.get(),b);store.dispose();assert.equal(live.size,0);assert.equal(store.get(),null);store.dispose();
  const canvasWith=blob=>(width,height)=>({width,height,getContext:()=>fakeContext({rects:[],text:[],images:0}),toBlob:(cb,type)=>{assert.equal(type,'image/png');assert.deepEqual([width,height],[1080,1350]);cb(blob);}});
  const blob={size:5};assert.equal(await renderCardBlob(createDefaultSpec(),{createCanvas:canvasWith(blob)}),blob);
  await assert.rejects(renderCardBlob(createDefaultSpec(),{createCanvas:canvasWith(null)}),/could not be created/);
  await assert.rejects(renderCardBlob(createDefaultSpec(),{createCanvas:()=>{throw Error('no canvas');}}),/no canvas/);
  const f={name:CARD_FILENAME};
  assert.equal(canShareFile({share(){},canShare:()=>true},f),true);assert.equal(canShareFile({share(){}},f),false);assert.equal(canShareFile({share(){},canShare:()=>{throw Error();}},f),false);assert.equal(canShareFile(null,f),false);assert.equal(canShareFile({share(){},canShare:()=>true},null),false);
  assert.equal(await shareCard({share:async()=>{}},f),'shared');assert.equal(await shareCard({share:async()=>{throw Object.assign(Error(),{name:'AbortError'});}},f),'cancelled');assert.equal(await shareCard({share:async()=>{throw Error('x');}},f),'failed');
  const made=[];const doc={createElement:()=>{const el={style:{},click(){made.push(el);},remove(){el.removed=true;}};return el;},body:{append(){}}};
  assert.equal(requestDownload('blob:1',doc),true);assert.equal(made[0].download,CARD_FILENAME);assert.equal(made[0].removed,true);assert.equal(requestDownload('blob:1',{createElement(){throw Error();}}),false);
});
