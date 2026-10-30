import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {extractPurchaseItems} from '../server/purchase-provider.js';
import {normalizePurchaseText,hash,purchaseSchema} from '../server/purchase-contract.js';
import {purchaseFixtures} from '../tests/fixtures/purchase-import/cases.js';
import {modelFor} from '../server/model-config.js';

const selected=process.argv.find(x=>x.startsWith('--model='))?.slice(8)||modelFor('purchase');
const source=normalizePurchaseText(purchaseFixtures[0].text),started=performance.now();
let revision='unavailable';try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
const report={task:'extract_purchase_items',synthetic:true,sourceHash:source.hash,schemaHash:hash(purchaseSchema),localCheckoutRevision:revision,note:'Checkout may contain uncommitted changes; review the GitHub publication commit separately.',runtime:{node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,ramBytes:os.totalmem()},selectedModel:selected,seed:17,temperature:0,timeoutMs:120000,cache:'No extraction cache; model residency not controlled',dependencyHash:hash(readFileSync('package-lock.json','utf8'))};
try{report.result=await extractPurchaseItems(source,{model:selected});report.status='passed';}
catch(e){report.status=e.code==='MODEL_NOT_READY'?'unavailable':'failed';report.error={code:e.code||'UNKNOWN',message:e.message};process.exitCode=1;}
report.elapsedMs=performance.now()-started;mkdirSync('output/smart-import',{recursive:true});const file=`output/smart-import/smoke-${selected.replace(/[^a-z0-9-]/gi,'_')}.json`;writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,elapsedMs:report.elapsedMs,report:file,error:report.error}));
