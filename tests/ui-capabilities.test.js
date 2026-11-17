import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';

// Render the real JSX components without starting a browser, HTTP server or API.
const compiled=await build({entryPoints:['src/PersonalStyle.jsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],loader:{'.css':'empty'},logLevel:'silent'});
const componentModule={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),componentModule,componentModule.exports);
const {StylePreferences,KnowledgeLibrary}=componentModule.exports;
const hosted={hosted:true,openai:{configured:true}};
const state={wardrobeId:'test',preferences:{recognitionProvider:'openai',embeddingProvider:'openai'}};
function choices(html,label){
 const section=html.match(new RegExp(`<label>${label}<select[^>]*>(.*?)</select>`));assert.ok(section,`${label} selector exists`);
 return [...section[1].matchAll(/<option([^>]*)>(.*?)<\/option>/g)].map(([,attrs,label])=>({value:attrs.match(/value="([^"]+)"/)?.[1],disabled:/\bdisabled(?:=|\s|$)/.test(attrs),selected:/\bselected(?:=|\s|$)/.test(attrs),label}));
}
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

test('hosted photo preferences allow an OpenAI user to opt into manual review while local styling remains unavailable',()=>{
 const html=render(StylePreferences,{state,ai:hosted,onSave(){}});
 const photos=choices(html,'Photo recognition'),styling=choices(html,'Outfit recommendations');
 assert.equal(photos.find(option=>option.value==='openai').selected,true);
 assert.deepEqual(photos.find(option=>option.value==='local'),{value:'local',disabled:false,selected:false,label:'Manual review · no AI photo upload'});
 assert.equal(styling.find(option=>option.value==='local').disabled,true);
 const manual=render(StylePreferences,{state:{...state,preferences:{recognitionProvider:'local'}},ai:hosted,onSave(){}});
 assert.equal(choices(manual,'Photo recognition').find(option=>option.value==='local').selected,true);
 assert.match(manual,/Photos you save stay in your private account; they are not sent to an AI model/);
});

test('hosted knowledge settings offer keyword-only opt-out without permitting local semantic indexing',()=>{
 const html=render(KnowledgeLibrary,{wardrobeId:'test',preferences:{embeddingProvider:'openai'},ai:hosted,onSave(){}});
 assert.deepEqual(choices(html,'Embedding provider').find(option=>option.value==='local'),{value:'local',disabled:false,selected:false,label:'Keyword only · no embedding API'});
 const lexical=render(KnowledgeLibrary,{wardrobeId:'test',preferences:{embeddingProvider:'local'},ai:hosted,onSave(){}});
 assert.equal(choices(lexical,'Embedding provider').find(option=>option.value==='local').selected,true);
 assert.match(lexical,/<button[^>]*disabled=""[^>]*>Build semantic index/);
 assert.match(lexical,/retrieved notes can still be sent to your selected styling model/);
});

test('local development retains local model labels and unavailable OpenAI cannot be selected',()=>{
 const ai={hosted:false,openai:{configured:false}};
 const html=render(StylePreferences,{state,ai,onSave(){}});
 const photos=choices(html,'Photo recognition');
 assert.equal(photos.find(option=>option.value==='local').label,'Local · runs on this server');
 assert.equal(photos.find(option=>option.value==='local').disabled,false);
 assert.equal(photos.find(option=>option.value==='openai').disabled,true);
 const knowledge=render(KnowledgeLibrary,{wardrobeId:'test',preferences:{embeddingProvider:'local'},ai,onSave(){}});
 assert.equal(choices(knowledge,'Embedding provider').find(option=>option.value==='local').label,'Local · runs on this server');
});
