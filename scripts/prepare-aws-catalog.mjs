import {mkdirSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const root=resolve('tmp/aws-catalog');
const files=['infra/aws/catalog-refresh.mjs','server/catalog-store.js','server/shopping-library.js','server/shopping.js','server/work-limiter.js','server/openai.js','server/recognition.js','server/photo-quality.js'];
for(const file of files){const target=resolve(root,file);if(!target.startsWith(root))throw Error('Invalid bundle path');mkdirSync(dirname(target),{recursive:true});copyFileSync(file,target);}
const source=JSON.parse(readFileSync('package.json'));
writeFileSync(resolve(root,'package.json'),JSON.stringify({name:'closet-catalog-worker',version:source.version,type:'module',dependencies:Object.fromEntries(['@aws-sdk/client-dynamodb','@aws-sdk/client-secrets-manager','sharp'].map(k=>[k,source.dependencies[k]]))},null,2));
// SAM builds this allowlisted source folder for Linux; no .env, photos, models,
// account snapshots, development datasets, or Windows node_modules are copied.
console.log(JSON.stringify({directory:root,sourceFiles:files.length,next:'sam build --use-container --template-file infra/aws/template.yaml'}));

