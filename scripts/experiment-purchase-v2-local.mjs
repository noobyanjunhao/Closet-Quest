// Real candidate inference through the existing worker/provider contract, no cloud writes.
import {writeFileSync} from 'node:fs';
import {normalizePurchaseText} from '../server/purchase-contract.js';
import {runClaimedPurchase,tunedPurchaseProvider} from '../server/purchase-worker-client.js';
const origin='http://127.0.0.1:4182';
const health=await fetch(`${origin}/healthz`).then(r=>r.json());
if(health.metadata?.promptVersion!=='purchase-line-v2')throw Error('Start the v2 candidate explicitly');
const tests=[];
for(const [name,text,categories] of [
 ['previous omitted trousers','Harbor Demo Store\nNavy linen trousers, size M, quantity 1\nShipping 5.00\nDiscount -3.00',['Bottom']],
 ['two garments','Baseball cap, color: Navy, quantity: 1\nZip hoodie, color Grey, size L, quantity 1',['Accessory','Top']],
]){
 const source=normalizePurchaseText(text),start=performance.now();
 try{
  const result=await runClaimedPurchase({source,deadlineMs:120000},{provider:tunedPurchaseProvider,signal:AbortSignal.timeout(120000)});
  const actual=result.data.items.map(i=>i.category).sort();
  tests.push({name,passed:JSON.stringify(actual)===JSON.stringify([...categories].sort()),elapsedMs:performance.now()-start,...result});
 }catch(e){tests.push({name,passed:false,error:e.message,elapsedMs:performance.now()-start});}
}
const post=(body,headers={})=>fetch(`${origin}/extract`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
const forbidden=await post({text:'Cotton tee'},{Origin:'https://example.com'});tests.push({name:'browser-origin denied',passed:forbidden.status===403,status:forbidden.status});
const invalid=await post({text:'\u0000'});tests.push({name:'invalid input rejected',passed:invalid.status===422,status:invalid.status});
const simultaneous=await Promise.all([post({text:'Cotton tee, quantity 1'}),post({text:'Wool coat, quantity 1'})]);
const statuses=simultaneous.map(r=>r.status).sort();tests.push({name:'concurrent GPU work refused',passed:JSON.stringify(statuses)==='[200,429]',statuses});
const retry=await post({text:'Silk scarf, quantity 1'});const retried=await retry.json();tests.push({name:'request after busy response recovers',passed:retry.status===200&&retried.data?.items?.length===1,status:retry.status});
const report={environment:'Loopback HTTP + real saved adapter + canonical Node worker validator',synthetic:true,cloudWrites:0,wardrobeWrites:0,health,passed:tests.filter(t=>t.passed).length,total:tests.length,tests};
writeFileSync('output/purchase-ml-v2/local-integration.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,total:report.total,failed:tests.filter(t=>!t.passed).map(t=>t.name)},null,2));
if(report.passed!==report.total)process.exitCode=1;
