// Explicit model choice; runs locally and prints editable category suggestions.
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, statSync } from 'node:fs';
const [modelChoice,image]=process.argv.slice(2);
const models={clip:'Xenova/clip-vit-base-patch32',siglip:'Xenova/siglip-base-patch16-224'};
if(!models[modelChoice]||!image){console.error('Usage: npm run vision:classify -- clip|siglip path/to/photo.png');process.exit(1);}
if(statSync(image).size>8*1024*1024)throw new Error('Use an image under 8 MB.');
env.cacheDir='.model-cache';env.allowLocalModels=false;
const revisions=JSON.parse(readFileSync('vision/model-revisions.json'));
const labels={Top:'a shirt or sweater',Bottom:'a pair of trousers',Shoes:'a shoe',Outerwear:'a jacket or coat',Dress:'a dress',Accessory:'a handbag'};
const model=models[modelChoice];
const classifier=await pipeline('zero-shot-image-classification',model,{revision:revisions[model],dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:4,interOpNumThreads:1}});
const predictions=await classifier(image,Object.values(labels),{hypothesis_template:'a photo of {}'});
console.log(JSON.stringify({model,revision:revisions[model],notice:'Uncalibrated ranking scores, not confidence. Always review category. No color extraction or background cleanup.',predictions:predictions.map(p=>({category:Object.keys(labels).find(k=>labels[k]===p.label),score:p.score}))},null,2));
await classifier.dispose();
