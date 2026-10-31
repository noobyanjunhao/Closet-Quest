import {readFileSync,writeFileSync} from 'node:fs';
import {rulePurchaseProvider} from '../server/purchase-rules.js';
import {normalizePurchaseText} from '../server/purchase-contract.js';
const rows=readFileSync('data/evaluation/purchase-v1/test.jsonl','utf8').trim().split('\n').map(JSON.parse);
const results=rows.map(row=>{const start=performance.now();try{const result=rulePurchaseProvider(normalizePurchaseText(row.source));return {id:row.id,prediction:result.data,metadata:result.metadata,elapsedMs:performance.now()-start};}catch(e){return {id:row.id,prediction:null,error:e.message,elapsedMs:performance.now()-start};}});
writeFileSync('output/purchase-ml/runtime-parser-raw.json',JSON.stringify(results,null,2));
console.log(`Evaluated ${results.length} frozen examples with the deployed parser implementation.`);
