// A tiny generated Add graph checks native CPU inference without downloading
// model weights or using credentials. This is a runtime smoke test, not an
// embedding/recognition accuracy evaluation.
import assert from 'node:assert/strict';
import * as ort from 'onnxruntime-node';

const varint=value=>{const bytes=[];do{let byte=value&127;value>>>=7;if(value)byte|=128;bytes.push(byte);}while(value);return Buffer.from(bytes);};
const int=(field,value)=>Buffer.concat([varint(field<<3),varint(value)]);
const message=(field,value)=>{const bytes=typeof value==='string'?Buffer.from(value):value;return Buffer.concat([varint((field<<3)|2),varint(bytes.length),bytes]);};
const concat=(...parts)=>Buffer.concat(parts);
// ONNX ModelProto: IR 8, default-domain opset 13, float32 vectors of size two.
const valueInfo=name=>concat(message(1,name),message(2,message(1,concat(int(1,1),message(2,message(1,int(1,2)))))));
const node=concat(message(1,'x'),message(1,'y'),message(2,'z'),message(4,'Add'));
const graph=concat(message(1,node),message(2,'closet-cpu-smoke'),message(11,valueInfo('x')),message(11,valueInfo('y')),message(12,valueInfo('z')));
const model=concat(int(1,8),message(2,'Closet Quest CPU smoke'),message(7,graph),message(8,int(2,13)));
const session=await ort.InferenceSession.create(model,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1});
try {
  const result=await session.run({x:new ort.Tensor('float32',Float32Array.from([-2.5,7]),[2]),y:new ort.Tensor('float32',Float32Array.from([5,.5]),[2])});
  assert.deepEqual(Array.from(result.z.data),[2.5,7.5]);
  console.log(JSON.stringify({test:'onnx-cpu-inference',passed:true,executionProvider:'cpu',modelBytes:model.length,networkRequests:0}));
} finally {await session.release();}
