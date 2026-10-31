import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
const path='.local-data/deployment/purchase-worker.json';
if(!existsSync(path)){
 const config=JSON.parse(readFileSync('.local-data/deployment/supabase-config.json','utf8'));
 writeFileSync(path,JSON.stringify({...config,workerKey:randomBytes(32).toString('hex')},null,2));
}
const config=JSON.parse(readFileSync(path,'utf8'));
const digest=createHash('sha256').update(config.workerKey).digest('hex');
const sql=['begin;',...['003_purchase_imports.sql','004_purchase_workers.sql'].map(p=>readFileSync('supabase/migrations/'+p,'utf8')),`insert into private.purchase_workers(key_hash,name,expires_at) values('${digest}','Closet Quest private GPU worker',now()+interval '7 days');`,'commit;'].join('\n');
writeFileSync('.local-data/deployment/purchase-cloud-migration.sql',sql);
console.log('Prepared additive migration and seven-day scoped worker credential. No secrets printed.');
