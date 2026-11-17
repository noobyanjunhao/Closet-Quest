// Connectivity smoke check only: no real credentials, signup, email or AI calls.
import {randomBytes} from 'node:crypto';
import {access,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function validateOrigin(value) {
  let url;try {url=new URL(value);}catch {throw Error('Provide --origin with an explicit HTTPS origin.');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
    (url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))) {
    throw Error('Use an HTTPS origin without credentials, path, query or fragment; HTTP is allowed only for loopback testing.');
  }
  return url.origin;
}

const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value)?value:null;
const revision=value=>typeof value==='string'&&/^[a-f0-9]{40}$/i.test(value)?value.toLowerCase():null;
const safeVersion=value=>typeof value==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(value)?value:null;

export async function verifyHostedCloud({origin,expectedRevision,fetchImpl=fetch,timeoutMs=20000}) {
  origin=validateOrigin(origin);
  if(expectedRevision&&!revision(expectedRevision))throw Error('--expect-revision must be a full 40-character commit SHA.');
  async function request(path,body) {
    const start=performance.now();
    try {
      const response=await fetchImpl(origin+path,{method:body?'POST':'GET',redirect:'error',
        headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});
      const text=await response.text();let data;try {data=JSON.parse(text);}catch {}
      return {status:response.status,elapsedMs:Math.round(performance.now()-start),data,healthy:text.trim()==='ok'};
    } catch(error) {
      return {status:null,elapsedMs:Math.round(performance.now()-start),code:safeCode(error?.cause?.code)||
        (error?.name==='TimeoutError'?'PROBE_TIMEOUT':'PROBE_CONNECTION_FAILED')};
    }
  }
  const [health,release]=await Promise.all([request('/healthz'),request('/version.json')]);
  // A fresh random dummy password avoids supplying any real user's credentials.
  // Login does not create an account or trigger a confirmation/reset email.
  const auth=await request('/api/session/login',{email:'cloud-recovery-check@example.com',password:randomBytes(32).toString('hex')});
  const authCode=safeCode(auth.data?.code)||auth.code||null;
  const expectedRejection=auth.status===400&&authCode==='CLOUD_REQUEST_FAILED'||
    auth.status===401&&['INVALID_CREDENTIALS','INVALID_LOGIN_CREDENTIALS'].includes(authCode);
  const upstreamHttpResponse=[400,401,403,422].includes(auth.status)&&
    ['CLOUD_REQUEST_FAILED','INVALID_CREDENTIALS','INVALID_LOGIN_CREDENTIALS'].includes(authCode);
  const deployedRevision=revision(release.data?.revision);
  const checks={
    process:{passed:health.status===200&&health.healthy,status:health.status,elapsedMs:health.elapsedMs,code:health.code||null},
    release:{passed:release.status===200&&Boolean(deployedRevision)&&(!expectedRevision||deployedRevision===expectedRevision.toLowerCase()),
      status:release.status,elapsedMs:release.elapsedMs,revision:deployedRevision,version:safeVersion(release.data?.version),code:release.code||null},
    authenticationPath:{passed:expectedRejection,status:auth.status,elapsedMs:auth.elapsedMs,code:authCode,
      upstreamHttpResponse,expectedInvalidCredentialRejection:expectedRejection,
      diagnosis:expectedRejection?'Synthetic credentials were rejected by the authentication backend.':
        authCode==='CLOUD_PROJECT_UNREACHABLE'?'The app cannot resolve its configured database host.':
        upstreamHttpResponse?'The backend responded, but its rejection does not establish a usable authentication configuration.':
        'The authentication path did not return the expected rejection.'}
  };
  return {checkedAt:new Date().toISOString(),origin,passed:Object.values(checks).every(check=>check.passed),checks,
    scope:'Technical connectivity only. Does not verify real signup, email delivery, authenticated wardrobe sync, model readiness or user acceptance.',
    requests:{total:3,syntheticLoginAttempts:1,signups:0,emails:0,modelCalls:0}};
}

export function parseArgs(args) {
  const values={};
  for(let index=0;index<args.length;index++) {
    const name=args[index];
    if(!['--origin','--expect-revision','--out'].includes(name)||!args[index+1]||args[index+1].startsWith('--'))throw Error('Usage: node scripts/verify-hosted-cloud.mjs --origin HTTPS_ORIGIN [--expect-revision SHA] [--out FILE.json]');
    if(values[name])throw Error(`Duplicate option: ${name}`);
    values[name]=args[++index];
  }
  if(!values['--origin'])throw Error('--origin is required; no deployment is contacted by default.');
  return {origin:validateOrigin(values['--origin']),expectedRevision:values['--expect-revision'],out:values['--out']};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {out,...options}=parseArgs(process.argv.slice(2));
    if(out) {
      try {await access(out);throw Error('Output already exists. Choose a new filename; no requests were sent.');}
      catch(error) {if(error.code!=='ENOENT')throw error;}
    }
    const result=await verifyHostedCloud(options),text=JSON.stringify(result,null,2)+'\n';
    if(out){await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(out,text,{flag:'wx'});}
    console.log(text.trim());if(!result.passed)process.exitCode=1;
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
