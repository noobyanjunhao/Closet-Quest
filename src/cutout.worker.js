import {AutoModel, RawImage, Tensor, env} from '@huggingface/transformers';
import {foregroundBounds} from './garment-display.js';
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let segmenter;
self.onmessage = async ({data:{source}}) => {
  try {
    segmenter ||= await AutoModel.from_pretrained('BritishWerewolf/U-2-Netp',{
      revision:'7112208', device:'wasm', dtype:'fp32',
      progress_callback:p=>self.postMessage({progress:p.status==='progress'?'Downloading cutout model…':'Preparing cutout model…'}),
    });
    self.postMessage({progress:'Separating the foreground…'});
    const image=(await RawImage.read(source)).rgb();
    const input=await image.resize(320,320);
    const values=new Float32Array(3*320*320),mean=[.485,.456,.406],std=[.229,.224,.225];
    let max=1;for(const value of input.data)max=Math.max(max,value);
    for(let p=0;p<320*320;p++)for(let c=0;c<3;c++)values[c*320*320+p]=(input.data[p*3+c]/max-mean[c])/std[c];
    const output=await segmenter({'input.1':new Tensor('float32',values,[1,3,320,320])});
    const prediction=output['1959']||output.mask;
    if(!prediction||prediction.data.length!==320*320)throw new Error('Unexpected cutout mask.');
    let lo=Infinity,hi=-Infinity;for(const v of prediction.data){lo=Math.min(lo,v);hi=Math.max(hi,v);}
    if(!Number.isFinite(lo)||hi-lo<.00001)throw new Error('No distinct foreground found.');
    const mask=new RawImage(Uint8ClampedArray.from(prediction.data,v=>255*(v-lo)/(hi-lo)),320,320,1);
    const result=image.clone().putAlpha(await mask.resize(image.width,image.height));
    const cropped=await result.crop(foregroundBounds(result.data,result.width,result.height));
    const scale=Math.min(1,700/Math.max(cropped.width,cropped.height));
    const resized=scale<1?await cropped.resize(Math.round(cropped.width*scale),Math.round(cropped.height*scale)):cropped;
    const blob = await resized.toBlob();
    self.postMessage({blob});
  } catch (error) {
    segmenter = null;
    self.postMessage({error:error.message || 'AI cutout could not finish. Try plain-background cleanup.'});
  }
};
