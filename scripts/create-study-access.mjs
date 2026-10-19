import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const count=Number(process.argv[2]||6);
if(!Number.isInteger(count)||count<1||count>50)throw new Error('Choose 1 to 50 participants.');
const directory=resolve('.local-data/deployment');await mkdir(directory,{recursive:true});
const participants=Array.from({length:count},(_,i)=>({id:`p${String(i+1).padStart(2,'0')}`,code:randomBytes(24).toString('base64url')}));
const config={CLOSET_SESSION_SECRET:randomBytes(48).toString('base64url'),CLOSET_ACCESS_USERS:JSON.stringify(participants.map(({id,code})=>({id,tokenHash:createHash('sha256').update(code).digest('hex')})))};
// wx protects previously distributed codes from accidental rotation.
await writeFile(resolve(directory,'hosting-secrets.json'),JSON.stringify(config,null,2),{flag:'wx',mode:0o600});
await writeFile(resolve(directory,'participant-codes.json'),JSON.stringify(participants,null,2),{flag:'wx',mode:0o600});
console.log('Created private hosting configuration and participant codes under .local-data/deployment. Do not commit these files.');
