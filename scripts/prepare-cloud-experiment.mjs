import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {normalizePurchaseText} from '../server/purchase-contract.js';
import {purchaseFixtures} from '../tests/fixtures/purchase-import/cases.js';
const source=normalizePurchaseText(purchaseFixtures[0].text),id=randomUUID();
const payload={id,createKey:`cloud-experiment-${id}`,provider:'worker',source,status:'queued',revision:0,generation:1,items:[],audit:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),error:null};
const sql=`-- Synthetic draft only; does not add wardrobe items.\ninsert into public.purchase_imports(id,user_id,create_key,revision,payload) select '${id}',id,'${payload.createKey}',0,'${JSON.stringify(payload).replaceAll("'","''")}'::jsonb||jsonb_build_object('owner',id) from auth.users order by created_at limit 1;\nselect '${id}' as synthetic_import_id;`;
writeFileSync('.local-data/deployment/purchase-experiment-seed.sql',sql);writeFileSync('.local-data/deployment/purchase-experiment.json',JSON.stringify({id}));console.log('Prepared one synthetic cloud draft; no wardrobe mutation.');
