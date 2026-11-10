import dynalite from 'dynalite';
import {once} from 'node:events';
import * as commands from '@aws-sdk/client-dynamodb';
import {createCatalogStore,createDynamoTransport} from '../server/catalog-store.js';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

export async function experiment(){
 const server=dynalite({createTableMs:0});server.listen(0,'127.0.0.1');await once(server,'listening');
 const options={endpoint:`http://127.0.0.1:${server.address().port}`,region:'us-east-1',credentials:{accessKeyId:'local-test',secretAccessKey:'local-test'},maxAttempts:1};
 const clients=[new commands.DynamoDBClient(options),new commands.DynamoDBClient(options)];
 try{
  await clients[0].send(new commands.CreateTableCommand({TableName:'CatalogTest',KeySchema:[{AttributeName:'pk',KeyType:'HASH'}],AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'}],ProvisionedThroughput:{ReadCapacityUnits:1,WriteCapacityUnits:1}}));
  const transports=clients.map(client=>createDynamoTransport({client,commands,table:'CatalogTest'}));
  const stores=transports.map(transport=>createCatalogStore({transport,waitMs:3500}));
  let calls=0;const query={category:'Top',occasion:'formal',presentation:'any',maxPrice:null};
  const refresh=async()=>{calls++;await delay(50);return {query,searchedAt:new Date().toISOString(),products:[{title:'Synthetic shirt',price:40,currency:'USD',url:'https://www.jcrew.com/p/shirt/FIXTURE'}]};};
  const start=performance.now(),rows=await Promise.all(Array.from({length:40},(_,i)=>stores[i%2].getOrRefresh(query,refresh)));
  assert.equal(calls,1);assert.equal(rows.filter(r=>r.distributedCached).length,39);
  const now=Date.now();assert.equal(await transports[0].claim('lease-test','old',now,10),true);assert.equal(await transports[1].claim('lease-test','new',now+11,100),true);
  let fenced=false;try{await transports[0].commit('lease-test','old',rows[0],now+12,Math.floor(now/1000)+1000);}catch(e){fenced=e.name==='ConditionalCheckFailedException';}assert.equal(fenced,true);
  await transports[0].release('lease-test','old');assert.equal(await transports[0].claim('lease-test','third',now+13,100),false);
  await transports[1].release('lease-test','new');assert.equal(await transports[0].claim('lease-test','third',now+14,100),true);
  return {measuredAt:new Date().toISOString(),environment:'Dynalite loopback emulator + official AWS SDK v3, two separate clients; NOT an AWS deployment',requests:40,completed:rows.length,providerCalls:calls,sharedCacheResponses:39,staleWriterRejected:fenced,foreignReleaseRejected:true,releaseRecovery:true,elapsedMs:Math.round(performance.now()-start),awsResourcesCreated:0,paidModelCalls:0};
 }finally{clients.forEach(c=>c.destroy());await new Promise(r=>server.close(r));}
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/experiment-aws-catalog.mjs')){
 const result=await experiment();mkdirSync('output/sprint9',{recursive:true});writeFileSync('output/sprint9/aws-catalog-experiment.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}

