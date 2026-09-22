// Downloads official local Ollama models; no wardrobe data leaves this device.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { modelFor } from '../server/model-config.js';
const isolated=process.argv.includes('--isolated-download');
const endpoint=isolated?'http://127.0.0.1:11435':'http://127.0.0.1:11434';
let helper;
if(isolated){
  let startupError='';
  helper=spawn(fileURLToPath(new URL('../tmp/ollama/bin/ollama.exe',import.meta.url)),['serve'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,OLLAMA_HOST:'127.0.0.1:11435',OLLAMA_NO_CLOUD:'1',OLLAMA_MODELS:fileURLToPath(new URL('../.model-cache/ollama',import.meta.url))}});
  helper.stderr.on('data',chunk=>{startupError=(startupError+chunk.toString()).slice(-2500);});
  helper.on('error',error=>{console.error(error.message);process.exitCode=1;});
  let ready=false;
  for(let n=0;n<150;n++){
    try{ready=(await fetch(endpoint+'/api/version',{signal:AbortSignal.timeout(500)})).ok;}catch{}
    if(ready||helper.exitCode!==null)break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready){helper.kill();throw new Error('The temporary download runtime did not start. '+startupError);}
}
try {
const models = process.argv.includes('--embeddings-only') ? [modelFor('embedding')] : [...new Set(['embedding','recognition','stylist'].map(modelFor))];
for (const model of models) {
  console.log(`Preparing ${model}`);
  const response = await fetch(endpoint+'/api/pull', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:true})});
  if (!response.ok) throw new Error(`Ollama pull failed: ${response.status}`);
  let buffer='', last='';
  for await (const chunk of response.body) {
    buffer += new TextDecoder().decode(chunk);
    const lines=buffer.split('\n');buffer=lines.pop();
    for (const line of lines) if(line.trim()) {
      const event=JSON.parse(line);
      if(event.error)throw new Error(event.error);
      const status=event.total&&Number.isFinite(event.completed)?`${event.status}: ${Math.floor(10*event.completed/event.total)*10}%`:event.status;
      if(status!==last){console.log(status);last=status;}
    }
  }
}
console.log('Plan A local models are installed. Model promotion still depends on evaluation.');
}finally{helper?.kill();}
