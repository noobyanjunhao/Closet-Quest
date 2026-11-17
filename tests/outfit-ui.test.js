import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';

// Exercise the actual JSX without a browser, server, or provider request.
const compiled=await build({entryPoints:['src/OutfitStudio.jsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom'],loader:{'.css':'empty'},logLevel:'silent'});
const componentModule={exports:{}};
const requireModule=createRequire(import.meta.url);
// Render portal contents inline so SSR can exercise the real outfit card.
new Function('require','module','exports','document',compiled.outputFiles[0].text)(id=>id==='react-dom'?{createPortal:child=>child}:requireModule(id),componentModule,componentModule.exports,{body:{}});
const OutfitStudio=componentModule.exports.default;
function render(overrides={}){
 return renderToStaticMarkup(React.createElement(OutfitStudio,{
  items:[],context:'Campus casual',request:'',engine:'agent',anchorId:'',aiReady:false,openaiConfigured:true,
  styling:false,previewing:false,processingCount:0,options:[],selected:0,
  view:{briefOpen:true,matchesOpen:false,evidenceOpen:false,cardOpen:false},
  scrollPosition:{current:0},shoppingStore:{current:{}},...overrides
 }));
}
function choice(html,value){
 const match=html.match(new RegExp(`<option([^>]*value="${value}"[^>]*)>(.*?)</option>`));
 assert.ok(match,`${value} styling option exists`);
 return {disabled:/\bdisabled(?:=|\s|$)/.test(match[1]),label:match[2]};
}

test('the Stylist offers direct shop search without an outfit, plus shopping on a complete look',()=>{
 const direct=render({request:'Find black loafers under $150',engine:'local',aiReady:false});
 assert.match(direct,/<button class="primary">Find shop picks/);
 assert.doesNotMatch(direct,/Create my looks|Quick look · no AI call/);
 const mixed=render({request:'Style my jeans and find black loafers under $150',options:[{wearId:'test',title:'Dinner',itemIds:[],shoppingSuggestions:[]}],view:{briefOpen:true,cardOpen:true}});
 assert.match(mixed,/Style \+ shop/);
 assert.match(mixed,/Shop additions for this look/);
 assert.match(mixed,/<option value="Shoes" selected="">Shoes/);
 assert.match(mixed,/<option value="150" selected="">Up to \$150/);
});

test('stylist gates unavailable model engines while keeping configured OpenAI and quick matches available',()=>{
 const hosted=render();
 assert.equal(choice(hosted,'local').disabled,true);
 assert.match(choice(hosted,'local').label,/unavailable here/);
 assert.equal(choice(hosted,'openai').disabled,false);
 assert.equal(choice(hosted,'quick').disabled,false);
 const local=render({aiReady:true,openaiConfigured:false});
 assert.equal(choice(local,'local').disabled,false);
 assert.match(choice(local,'local').label,/server ready/);
 assert.equal(choice(local,'openai').disabled,true);
});

test('free text comes first and optional occasion hints start collapsed',()=>{
 const html=render({context:'',request:'An outdoor concert'});
 const preferences=html.match(/<details class="studio-preferences">([\s\S]*?)<\/details>/);
 assert.ok(preferences);
 assert.ok(html.indexOf('<textarea') < html.indexOf(preferences[0]));
 assert.match(html,/<textarea[^>]*>An outdoor concert<\/textarea>/);
 assert.match(preferences[1],/<option value="" selected="">Use my description<\/option>/);
 assert.match(preferences[1],/Coffee date/);
 assert.doesNotMatch(html,/Choose your occasion|Try a styling brief/);
 assert.match(render({context:'',engine:'baseline'}),/<option value="Campus casual" selected="">Everyday<\/option>/);
});

test('collapsed brief shows the generated wedding occasion instead of the default occasion',()=>{
 const html=render({options:[{wearId:'synthetic-look',title:'Wedding start',occasion:'Wedding',itemIds:[]}],view:{briefOpen:false,matchesOpen:false,evidenceOpen:false,cardOpen:false}});
 assert.match(html,/<summary>Change the brief<span>Wedding<\/span><\/summary>/);
 assert.doesNotMatch(html,/<summary>Change the brief<span>Campus casual/);
});
