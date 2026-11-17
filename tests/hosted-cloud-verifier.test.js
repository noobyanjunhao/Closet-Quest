import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs,validateOrigin,verifyHostedCloud} from '../scripts/verify-hosted-cloud.mjs';

const sha='a'.repeat(40),origin='https://closet.example';
function fixture(authStatus=400,authBody={code:'CLOUD_REQUEST_FAILED'}) {
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/healthz'))return new Response('ok');
    if(url.endsWith('/version.json'))return Response.json({revision:sha,version:'0.2.0-beta.1',secret:'must-not-export'});
    return Response.json(authBody,{status:authStatus,headers:{'Set-Cookie':'private-cookie-must-not-export'}});
  };
  return {calls,fetchImpl};
}

test('requires an explicit safe origin before any request',()=>{
  assert.throws(()=>parseArgs([]),/--origin is required/);
  for(const value of ['http://example.com','https://name:secret@example.com','https://example.com/path','https://example.com/?token=secret','https://example.com/#secret'])assert.throws(()=>validateOrigin(value));
  assert.equal(validateOrigin('http://localhost:4173'),'http://localhost:4173');
  assert.equal(validateOrigin('http://127.0.0.1:4173/'),'http://127.0.0.1:4173');
  assert.equal(validateOrigin(origin+'/'),origin);
});

test('makes exactly one synthetic login and exports only safe technical evidence',async()=>{
  const {calls,fetchImpl}=fixture(400,{code:'CLOUD_REQUEST_FAILED',error:'private-message',access_token:'private-token',user:{email:'private@example.com'}});
  const result=await verifyHostedCloud({origin,expectedRevision:sha,fetchImpl});
  assert.equal(result.passed,true);
  assert.equal(calls.length,3);
  const posts=calls.filter(call=>call.options.method==='POST');
  assert.equal(posts.length,1);assert.equal(posts[0].url,origin+'/api/session/login');
  assert.equal(posts[0].options.headers.Origin,origin);
  assert.equal(posts[0].options.headers.Cookie,undefined);
  const body=JSON.parse(posts[0].options.body);
  assert.equal(body.email,'cloud-recovery-check@example.com');
  assert.match(body.password,/^[a-f0-9]{64}$/);
  for(const sensitive of ['private-message','private-token','private@example.com','private-cookie','must-not-export',body.password,body.email])assert.equal(JSON.stringify(result).includes(sensitive),false);
  assert.equal(result.requests.signups,0);assert.equal(result.requests.modelCalls,0);
});

test('liveness and release success cannot mask DNS failure or ambiguous key rejection',async()=>{
  for(const [status,code] of [[503,'CLOUD_PROJECT_UNREACHABLE'],[503,'CLOUD_TIMEOUT'],[401,'CLOUD_REQUEST_FAILED'],[429,'CLOUD_REQUEST_FAILED'],[200,'CLOUD_REQUEST_FAILED']]) {
    const result=await verifyHostedCloud({origin,fetchImpl:fixture(status,{code}).fetchImpl});
    assert.equal(result.checks.process.passed,true);assert.equal(result.checks.release.passed,true);
    assert.equal(result.passed,false,`${status} ${code}`);
  }
});
test('explicit invalid-credential rejection from the updated auth handler passes the connectivity probe',async()=>{
 const result=await verifyHostedCloud({origin,fetchImpl:fixture(401,{code:'INVALID_CREDENTIALS'}).fetchImpl});
 assert.equal(result.passed,true);assert.equal(result.checks.authenticationPath.code,'INVALID_CREDENTIALS');
 assert.equal(result.checks.authenticationPath.expectedInvalidCredentialRejection,true);
});

test('rejects the wrong release and reports unavailable transport without leaking its error',async()=>{
  const mismatch=await verifyHostedCloud({origin,expectedRevision:'b'.repeat(40),fetchImpl:fixture().fetchImpl});
  assert.equal(mismatch.checks.release.passed,false);
  const failed=await verifyHostedCloud({origin,fetchImpl:async()=>{throw Error('secret debug body');}});
  assert.equal(failed.passed,false);assert.equal(JSON.stringify(failed).includes('secret debug body'),false);
});
