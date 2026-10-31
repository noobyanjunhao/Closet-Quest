// Canonical application validator and frozen application baseline for Python eval.
import {readFileSync,writeFileSync} from 'node:fs';
import {normalizePurchaseText,validateExtraction,purchaseSchema} from '../server/purchase-contract.js';
import {extractPurchaseItems,PURCHASE_SYSTEM_PROMPT} from '../server/purchase-provider.js';
import {rulePurchaseProvider} from '../server/purchase-rules.js';
const [command,input,output]=process.argv.slice(2);
if(command==='prompt')writeFileSync(output,JSON.stringify({system:PURCHASE_SYSTEM_PROMPT,schema:purchaseSchema}));
else if(command==='validate'){
 const rows=readFileSync(input,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 writeFileSync(output,JSON.stringify(rows.map(r=>{try{validateExtraction(structuredClone(r.prediction??r.target),normalizePurchaseText(r.source));return {id:r.id,valid:true};}catch(e){return {id:r.id,valid:false,code:e.code,error:e.message};}})));
}else if(command==='rules'){
 const rows=readFileSync(input,'utf8').trim().split('\n').map(JSON.parse),results=[];
 for(const row of rows){const start=performance.now();try{const result=rulePurchaseProvider(normalizePurchaseText(row.source));results.push({id:row.id,prediction:result.data,metadata:result.metadata,elapsedMs:performance.now()-start});}catch(e){results.push({id:row.id,prediction:null,error:e.message,code:e.code,elapsedMs:performance.now()-start});}}
 writeFileSync(output,JSON.stringify(results,null,2));
}else if(command==='ollama'){
 const rows=readFileSync(input,'utf8').trim().split('\n').map(JSON.parse),results=[];
 for(const row of rows){const start=performance.now();try{const result=await extractPurchaseItems(normalizePurchaseText(row.source));results.push({id:row.id,prediction:result.data,metadata:result.metadata,elapsedMs:performance.now()-start});}catch(e){results.push({id:row.id,prediction:null,error:e.message,code:e.code,elapsedMs:performance.now()-start});}writeFileSync(output,JSON.stringify(results,null,2));console.log(row.id,results.at(-1).error||'ok');}
}else throw Error('Expected prompt, validate, rules or ollama');
