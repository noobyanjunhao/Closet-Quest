import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {applyCutout,garmentImage,originalPhoto,foregroundBounds} from '../src/garment-display.js';
import {createCloud,validateCloudState} from '../server/cloud.js';
import {prepareCloudSnapshot} from '../src/cloud-sync.js';

test('display changes preserve original, recognition input, identity and wear history',()=>{
 const item={id:'tee',image:'photo.jpg',originalImage:'full-photo.jpg',wears:8,photoKey:'key',recognition:{status:'reviewed'}};
 const next=applyCutout(item,'data:image/png;base64,YQ==','BEN2');
 assert.equal(garmentImage(next),next.cutoutImage);
 assert.equal(garmentImage({...next,displayMode:'photo'}),item.image);
 assert.equal(garmentImage({...next,displayMode:'pixel'}),null);
 for(const key of Object.keys(item))assert.deepEqual(next[key],item[key]);
 assert.equal(originalPhoto(next),'full-photo.jpg');
 assert.equal(item.cutoutImage,undefined);
 assert.throws(()=>applyCutout(item,'https://untrusted.test/a.png','BEN2'));
});
test('foreground framing trims empty space without cutting into visible subject',()=>{
 const pixels=new Uint8ClampedArray(10*10*4);
 pixels[(4*10+4)*4+3]=255;pixels[(6*10+6)*4+3]=180;
 assert.deepEqual(foregroundBounds(pixels,10,10),[3,3,7,7]);
 assert.throws(()=>foregroundBounds(new Uint8ClampedArray(400),10,10),/No clear foreground/);
});
test('cutout sync uploads PNG separately and keeps both original references',async()=>{
 const state={items:[{image:'data:image/jpeg;base64,YQ==',originalImage:'data:image/jpeg;base64,YQ==',cutoutImage:'data:image/png;base64,Yg=='}]};
 const calls=[];
 const next=await prepareCloudSnapshot(state,async image=>{calls.push(image);return {image:`/api/cloud/photos/${'a'.repeat(64)}.${image.includes('png')?'png':'jpg'}`};});
 assert.equal(calls.length,2);
 assert.ok(next.items[0].cutoutImage.endsWith('.png'));
 assert.equal(next.items[0].image,next.items[0].originalImage);
 assert.ok(state.items[0].cutoutImage.startsWith('data:'));
});
test('cloud PNG upload preserves alpha and owner scope; JPEG remains supported',async()=>{
 const user={id:'b885b7a4-efac-423a-bb47-404162d5431c',token:'fixture-token'},calls=[];
 const cloud=createCloud({url:'https://fixture.supabase.co',key:'fixture-publishable-key-long',fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response('{}');}});
 const png=await sharp({create:{width:8,height:8,channels:4,background:{r:90,g:30,b:60,alpha:0.3}}}).png().toBuffer();
 const result=await cloud.uploadPhoto(user,'data:image/png;base64,'+png.toString('base64'));
 assert.ok(result.image.endsWith('.png'));assert.ok(calls[0].url.includes('/'+user.id+'/'));
 assert.equal(calls[0].opts.headers['Content-Type'],'image/png');
 const raw=await sharp(calls[0].opts.body).raw().toBuffer();assert.equal(raw[3],77);
 const jpg=await sharp(png).jpeg().toBuffer();
 assert.ok((await cloud.uploadPhoto(user,'data:image/jpeg;base64,'+jpg.toString('base64'))).image.endsWith('.jpg'));
 const state={items:[{id:'tee',name:'Tee',cutoutImage:result.image}],profile:'',xp:0,completed:[],submissions:[]};
 assert.equal(validateCloudState(state,user.id).items[0].cutoutImage,result.image);
 assert.throws(()=>validateCloudState({...state,items:[{...state.items[0],cutoutImage:'https://other.example/a.png'}]},user.id));
 await assert.rejects(()=>cloud.photo(user,'../someone.png'));
});
