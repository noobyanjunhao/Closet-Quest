import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAccess,accountNamespace} from '../server/access.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const origin='https://closet-test.onrender.com',secret='test-only-session-secret-not-for-deployment-0123456789';
const users=JSON.stringify([{id:'p01',tokenHash:hash('test-code-one')},{id:'p02',tokenHash:hash('test-code-two')}]);
const request=(extra={})=>({method:'POST',headers:{host:'closet-test.onrender.com',origin,...extra}});
const login=(access,code)=>{let cookie;const value=access.login(request(),code,{setHeader:(_,value)=>cookie=value});return{value,cookie:cookie.split(';')[0]};};
test('hosted startup fails closed with missing identity configuration',()=>{
  assert.throws(()=>createAccess({origin}),/secret/);
  assert.throws(()=>createAccess({origin,secret,users:'[]'}),/participant/);
  assert.throws(()=>createAccess({origin:'http://example.com',secret,users}),/HTTPS/);
});
test('signed sessions identify participants, expire and reject tampering',()=>{
  let time=100000;
  const access=createAccess({origin,secret,users,now:()=>time}),one=login(access,'test-code-one');
  assert.equal(access.session(request({cookie:one.cookie})).namespace,accountNamespace('p01'));
  assert.match(one.cookie,/cq_session=/);
  assert.equal(access.session(request({cookie:one.cookie.replace(/.$/,'!')})),null);
  time+=8*86400000;assert.equal(access.session(request({cookie:one.cookie})),null);
});
test('code rotation revokes existing sessions and cookies have secure flags',()=>{
  const access=createAccess({origin,secret,users}),one=login(access,'test-code-one');
  const rotated=createAccess({origin,secret,users:JSON.stringify([{id:'p01',tokenHash:hash('replacement')}])});
  assert.equal(rotated.session(request({cookie:one.cookie})),null);
  let cookie;access.login(request(),'test-code-one',{setHeader:(_,value)=>cookie=value});
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/api'])assert.ok(cookie.includes(flag));
});
test('hosted writes reject missing and foreign origins and unauthorized sessions',()=>{
  const access=createAccess({origin,secret,users});
  assert.throws(()=>access.checkOrigin(request({origin:'https://attacker.example'})),/Same-origin/);
  assert.throws(()=>access.checkOrigin(request({origin:undefined})),/Same-origin/);
  assert.throws(()=>access.checkOrigin(request({host:'attacker.example'})),/Same-origin/);
  assert.throws(()=>access.require(request()),/Sign in/);
  assert.doesNotThrow(()=>access.checkOrigin(request()));
});
test('login and authenticated inference budgets are bounded',()=>{
  const access=createAccess({origin,secret,users});
  for(let n=0;n<30;n++)assert.throws(()=>access.login(request(),'wrong',{setHeader(){}}),/recognized/);
  assert.throws(()=>login(access,'test-code-one'),/limit/);
  for(let n=0;n<60;n++)access.allowInference({id:'p01'});
  assert.throws(()=>access.allowInference({id:'p01'}),/limit/);
  assert.doesNotThrow(()=>access.allowInference({id:'p02'}));
});
