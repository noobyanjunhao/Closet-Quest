import test from 'node:test';
import assert from 'node:assert/strict';
import {createExactSearchIndex,normalizedDot,preparedLexicalScore,searchTokens} from '../server/exact-search-index.js';
import {cosineSimilarity,normalizeVector} from '../server/embeddings.js';
const identity=JSON.stringify({model:'test',dimensions:512});
const rows=Array.from({length:200},(_,i)=>({document_id:`d${i}`,ordinal:0,title:`Style ${i}`,text:`Navy jacket for formal wedding ${i}`,
  vector:JSON.stringify(Array.from({length:512},(_,j)=>Math.sin((i+1)*(j+1)))),identity}));

test('prepared exact scores preserve cosine scores and ranking across 200 x 512 vectors',()=>{
  const index=createExactSearchIndex(),query=normalizeVector(Array.from({length:512},(_,j)=>Math.cos(j)),512);
  const first=index.prepare(rows,'owner'),second=index.prepare(rows,'owner');
  assert.equal(first.stats.misses,200);assert.equal(second.stats.hits,200);
  const expected=rows.map((r,i)=>({i,score:cosineSimilarity(query,JSON.parse(r.vector))}));
  const actual=second.records.map(({prepared},i)=>({i,score:normalizedDot(query,prepared.vector)}));
  actual.forEach((r,i)=>assert.ok(Math.abs(r.score-expected[i].score)<1e-12));
  const order=list=>list.sort((a,b)=>b.score-a.score).map(r=>r.i);
  assert.deepEqual(order(actual),order(expected));
  assert.equal(preparedLexicalScore(searchTokens('navy wedding'),second.records[0].prepared),0.75);
});
test('prepared index isolates owners and detects same-ID text, identity, vector edits and deletion',()=>{
  const index=createExactSearchIndex();
  index.prepare([rows[0]],'alice');
  assert.equal(index.prepare([rows[0]],'bob').stats.misses,1);
  for(const change of [{text:'red dress'},{title:'Wedding guide'},{identity:JSON.stringify({model:'new',dimensions:512})},{vector:rows[1].vector}]){
    const changed=index.prepare([{...rows[0],...change}],'alice');
    assert.equal(changed.stats.misses,1);
  }
  const deleted=index.prepare([],'alice');
  assert.equal(deleted.stats.entries,1,'Only Bob remains');
  assert.equal(index.prepare([rows[0]],'alice').stats.misses,1);
  index.invalidate('alice','d0');
  assert.equal(index.prepare([rows[0]],'alice').stats.misses,1);
});
test('bounded index rejects corrupt vectors and supports uncached comparison',()=>{
  const index=createExactSearchIndex({maxEntries:2});
  assert.equal(index.prepare(rows.slice(0,3),'owner').stats.entries,2);
  assert.equal(index.prepare([{...rows[0],vector:'[null]'}],'owner').records[0].prepared.corrupt,true);
  const noCache=createExactSearchIndex({maxEntries:0});
  noCache.prepare(rows,'owner');
  assert.equal(noCache.prepare(rows,'owner').stats.hits,0);
  index.clear();
  assert.equal(index.prepare([], 'owner').stats.entries,0);
});
