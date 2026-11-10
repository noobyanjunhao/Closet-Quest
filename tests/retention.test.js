import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createJobQueue} from '../server/jobs.js';
test('terminal photo files and records expire without another request to trigger cleanup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cq-retention-'));const queue=createJobQueue(async()=>({data:{name:'Fixture'}}),{storageDir:dir,ttl:10});
 try{queue.enqueue('data:image/jpeg;base64,YQ==',{provider:'openai',wardrobeId:'test'});await delay(100);
  assert.equal(readdirSync(dir).filter(f=>f.endsWith('.photo')).length,0);
  await delay(1050);assert.equal(readdirSync(dir).filter(f=>f.endsWith('.json')).length,0);
 }finally{queue.close();rmSync(dir,{recursive:true,force:true});}
});

