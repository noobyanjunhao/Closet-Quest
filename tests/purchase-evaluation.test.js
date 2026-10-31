import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizePurchaseText,validateExtraction} from '../server/purchase-contract.js';
test('frozen purchase benchmark: hashes, family separation and all 420 canonical labels',()=>{
 const root=new URL('../data/evaluation/purchase-v1/',import.meta.url);const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));const hashes=new Set(),families=new Set();let count=0;
 for(const split of ['train','validation','test']){
  const raw=readFileSync(new URL(`${split}.jsonl`,root));assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.files[split].sha256);
  const rows=raw.toString('utf8').trim().split('\n').map(JSON.parse),localFamilies=new Set(rows.map(r=>r.family));assert.equal(rows.length,manifest.files[split].rows);
  for(const f of localFamilies){assert.ok(!families.has(f));families.add(f);}
  for(const row of rows){const source=normalizePurchaseText(row.source);assert.equal(source.hash,row.sourceHash);assert.ok(!hashes.has(source.hash));hashes.add(source.hash);assert.equal(row.synthetic,true);validateExtraction(row.target,source);count++;}
 }
 assert.equal(count,420);
});
