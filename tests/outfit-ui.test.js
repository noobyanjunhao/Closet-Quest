import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';

// Exercise the actual JSX without a browser, server, or provider request.
const compiled=await build({entryPoints:['src/OutfitStudio.jsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],loader:{'.css':'empty'},logLevel:'silent'});
const componentModule={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),componentModule,componentModule.exports);
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
