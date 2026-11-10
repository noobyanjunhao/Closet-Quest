import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const env={...process.env,CLOSET_SKIP_ENV:'1',NODE_ENV:'test'};
for(const key of Object.keys(env))if(/^(SUPABASE_|CLOSET_|OPENAI_|AWS_)/.test(key)&&key!=='CLOSET_SKIP_ENV')delete env[key];
const files=readdirSync('tests').filter(f=>f.endsWith('.test.js')).map(f=>'tests/'+f);
const result=spawnSync(process.execPath,['--test','--test-timeout=30000',...files],{env,stdio:'inherit'});
process.exit(result.status??1);

