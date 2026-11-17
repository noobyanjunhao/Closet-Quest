import dynalite from 'dynalite';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {DynamoDBClient,CreateTableCommand} from '@aws-sdk/client-dynamodb';
const {createHandler}=createRequire(import.meta.url)('../infra/aws/practice/catalog.cjs');
const server=dynalite({createTableMs:0});server.listen(0,'127.0.0.1');await once(server,'listening');
const options={endpoint:`http://127.0.0.1:${server.address().port}`,region:'us-east-1',credentials:{accessKeyId:'local-only',secretAccessKey:'local-only'},maxAttempts:1};
const clients=[new DynamoDBClient(options),new DynamoDBClient(options)];
try{
 await clients[0].send(new CreateTableCommand({TableName:'Practice',KeySchema:[{AttributeName:'pk',KeyType:'HASH'}],AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'}],BillingMode:'PAY_PER_REQUEST'}));
 let now=Date.now();const handlers=clients.map(client=>createHandler({client,table:'Practice',now:()=>now}));
 const first=await handlers[0]({category:'Top'}),warm=await handlers[1]({category:'Top'});
 assert.equal(first.cached,false);assert.equal(warm.cached,true);
 const burst=await Promise.all(Array.from({length:20},(_,i)=>handlers[i%2]({category:'Bottom'})));
 assert.equal(burst.filter(r=>!r.cached).length,1);
 now+=901000;assert.equal((await handlers[1]({category:'Top'})).cached,false);
 await assert.rejects(handlers[0]({category:'Shoes',prompt:'unaccepted input'}));
 const result={measuredAt:new Date().toISOString(),environment:'Local Dynalite HTTP emulator + official AWS SDK; not AWS deployment',coldMiss:true,warmHitAcrossClients:true,concurrentRequests:20,completed:burst.length,cacheWriters:burst.filter(r=>!r.cached).length,expiredRecordRefreshed:true,unexpectedInputRejected:true,awsResourcesCreated:0,paidModelCalls:0,limits:'Does not verify IAM, Lambda packaging, CloudWatch permissions, AWS credits or actual cloud throughput.'};
 mkdirSync('output/aws-practice',{recursive:true});writeFileSync('output/aws-practice/local-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{clients.forEach(c=>c.destroy());await new Promise(r=>server.close(r));}
