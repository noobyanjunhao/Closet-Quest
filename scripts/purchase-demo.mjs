import {createLocalServer} from '../server/start.mjs';
import {createAccess} from '../server/access.js';
import {resolve} from 'node:path';

const local=process.argv.includes('--local'),mode=local?'local':'fixture',port=Number(process.env.IMPORT_DEMO_PORT||(local?4181:4180));
// Deliberately separate from real cloud accounts and the user's photo-job store.
const server=await createLocalServer({apiOptions:{cloud:null,access:createAccess({origin:null}),storageDir:resolve(`.local-data/purchase-demo/${mode}/jobs`),purchaseOptions:{enabled:true,mode}}});
server.listen(port,'127.0.0.1',()=>console.log(`Purchase ${mode} demo: http://127.0.0.1:${port}/?demo=sprint6`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
