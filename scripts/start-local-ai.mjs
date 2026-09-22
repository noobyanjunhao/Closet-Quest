import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { modelFor } from '../server/model-config.js';

async function ready() {
  try { return (await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(1000)})).ok; }
  catch { return false; }
}
if (await ready()) { console.log('Local Ollama is already running.'); }
else {
  const bundled = fileURLToPath(new URL('../tmp/ollama/bin/ollama.exe',import.meta.url));
  const useBundled = process.platform === 'win32' && existsSync(bundled);
  const child = spawn(useBundled ? bundled : 'ollama',['serve'],{ detached:true, windowsHide:true, stdio:'ignore', env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1',...(useBundled ? {OLLAMA_MODELS:fileURLToPath(new URL('../.model-cache/ollama',import.meta.url))} : {})} });
  let startError;
  child.on('error',error=>{startError=error;});child.unref();
  let started=false;
  for(let attempt=0;attempt<15;attempt++) {
    if(startError)throw new Error('Install Ollama from https://ollama.com/download first. '+startError.message);
    if(await ready()){started=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!started)throw new Error('Ollama did not start. Run ollama serve in a terminal to see its startup error.');
  console.log('Local Ollama started.');
}
const data=await fetch('http://127.0.0.1:11434/api/tags').then(r=>r.json());
const missing=[...new Set(['recognition','stylist','embedding'].map(modelFor))].filter(model=>!data.models?.some(m=>m.name===model));
console.log(missing.length?`Missing local models: ${missing.join(', ')}. Run npm run ai:setup, then npm run dev.`:'All configured models are installed. Start the app with npm run dev.');
