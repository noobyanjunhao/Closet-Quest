// A frozen, credential-free copy for navigation reviews. Never a live-model test.
import {cp, mkdir, mkdtemp, writeFile, readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {spawnSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=resolve('.'), env={...process.env,CLOSET_SKIP_ENV:'1'};
const port=Number(process.argv.find(a=>a.startsWith('--port='))?.split('=')[1]||4186);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Choose a valid local review port.');
for(const key of Object.keys(env))if(/^(SUPABASE_|CLOSET_|OPENAI_|AWS_|VITE_)/.test(key)&&key!=='CLOSET_SKIP_ENV')delete env[key];
const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{env,stdio:'inherit'});
if(build.status!==0)process.exit(build.status||1);
await mkdir(join(root,'.local-data'),{recursive:true});
const frozen=await mkdtemp(join(root,'.local-data','review-'));
for(const part of ['server','src','data','dist','contracts','ml/artifacts','package.json','tests/fixtures/purchase-import'])await cp(join(root,part),join(frozen,part),{recursive:true});
// Node resolves the parent's installed dependencies; source and build are copied.
const html=await readFile(join(frozen,'dist/index.html'));
const buildId=createHash('sha256').update(html).digest('hex');
await writeFile(join(frozen,'review.mjs'),`
globalThis.fetch=async()=>{throw new Error('External services are disabled in this isolated review.');};
const {createLocalServer}=await import('./server/start.mjs');
const {recommend}=await import('./server/recommendation.js');
const unavailable=async()=>{throw Object.assign(new Error('Photo AI is disabled in this no-cost review. Add details manually.'),{status:503,code:'REVIEW_ONLY'});};
const server=await createLocalServer({apiOptions:{services:{recognize:unavailable,analyzeInspiration:unavailable,listModels:async()=>({models:[]}),style:(body,deps)=>recommend({...body,provider:'quick'},deps)}}});
server.listen(${port},'127.0.0.1',()=>console.log('Frozen review: http://127.0.0.1:${port}/ | no cloud, paid AI, or server outbound requests'));
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>server.shutdown().then(()=>process.exit()));
`);
await writeFile(join(frozen,'review-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),buildId,kind:'isolated local agent-assisted review',paidCallsAllowed:false,liveRecognition:false},null,2));
console.log('Review snapshot:',frozen,'build:',buildId);
if(process.argv.includes('--prepare-only'))process.exit(0);
const child=spawn(process.execPath,['review.mjs'],{cwd:frozen,env,stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
