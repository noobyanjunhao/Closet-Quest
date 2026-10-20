import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreRecognition} from '../scripts/recognition-metrics.mjs';
test('recognition metrics retain failures and separate baseline/multi-image denominators',()=>{
  const rows=[
    {mode:'multiple',expected:['Top','Accessory'],predicted:['Top','Shoes'],annotatedHat:true,hatDetected:false,status:'completed',latencyMs:100},
    {mode:'multiple',expected:['Top'],predicted:['Top'],annotatedHat:false,hatDetected:false,status:'failed',latencyMs:1000},
    {mode:'single',expected:['Dress'],predicted:['Dress'],status:'completed',latencyMs:50},
  ];
  const score=scoreRecognition(rows);
  assert.equal(score.multiple.images,2);assert.equal(score.multiple.failureRate,0.5);
  assert.equal(score.multiple.tp,1);assert.equal(score.multiple.fp,1);assert.equal(score.multiple.fn,2);
  assert.equal(score.multiple.microRecall,1/3);assert.equal(score.multiple.exactSetAccuracy,0);
  assert.equal(score.multiple.hat.positiveImages,1);assert.equal(score.multiple.hat.recall,0);
  assert.equal(score.single.exactSetAccuracy,1);assert.equal(score.single.hat.recall,null);
});
