import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const digest = value => createHash('sha256').update(String(value)).digest();
const fail = (message, status=401) => Object.assign(new Error(message), {status});
export const accountNamespace = id => {
  const h=digest(`closet-participant:${id}`).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
};
export function createAccess({origin=process.env.CLOSET_PUBLIC_ORIGIN,secret=process.env.CLOSET_SESSION_SECRET,users=process.env.CLOSET_ACCESS_USERS,now=Date.now}={}) {
  const hosted=Boolean(origin);
  let accounts=[];
  if(hosted) {
    const url=new URL(origin);
    if(url.protocol!=='https:'||url.origin!==origin)throw new Error('CLOSET_PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash.');
    if(typeof secret!=='string'||secret.length<32)throw new Error('Hosted access requires a random session secret of at least 32 characters.');
    try {accounts=JSON.parse(users);}catch{throw new Error('Configure CLOSET_ACCESS_USERS before hosting.');}
    if(!Array.isArray(accounts)||!accounts.length||accounts.length>50||accounts.some(user=>!/^p[0-9]{2,3}$/.test(user.id)||!/^[a-f0-9]{64}$/.test(user.tokenHash))||new Set(accounts.map(u=>u.id)).size!==accounts.length)throw new Error('Configure unique participant IDs and SHA-256 access-code hashes.');
  }
  const attempts=new Map(), usage=new Map();
  const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
  function session(req) {
    if(!hosted)return null;
    const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('cq_session='))?.slice(11);
    if(!token||token.length>1024)return null;
    const [payload,signature]=token.split('.');
    if(!signature||!timingSafeEqual(digest(signature),digest(sign(payload))))return null;
    try {const value=JSON.parse(Buffer.from(payload,'base64url').toString());const account=accounts.find(a=>a.id===value.id);
      if(!account||value.expires<=now()||value.expires>now()+8*86400000||value.version!==account.tokenHash.slice(0,16))return null;
      return {id:account.id,namespace:accountNamespace(account.id),csrf:value.csrf};
    }catch{return null;}
  }
  function checkOrigin(req) {
    const host=req.headers.host||'', requestOrigin=req.headers.origin;
    if(hosted) {
      if(host!==new URL(origin).host||requestOrigin&&requestOrigin!==origin)throw fail('Same-origin access required.',403);
      if(!['GET','HEAD'].includes(req.method)&&requestOrigin!==origin)throw fail('Same-origin request required.',403);
    } else if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host)||(requestOrigin&&requestOrigin!==`http://${host}`))throw fail('Local same-origin access only.',403);
  }
  function limit(map,key,max,window) {
    const time=now();for(const [id,value] of map)if(value.expires<=time)map.delete(id);
    if(!map.has(key)&&map.size>=2000)throw fail('Service is busy. Try again later.',429);
    const bucket=map.get(key)||{count:0,expires:time+window};
    if(bucket.count>=max)throw fail('Request limit reached. Try again later.',429);
    bucket.count++;map.set(key,bucket);
  }
  return {hosted,origin,session,checkOrigin,
    require(req) {const user=session(req);if(hosted&&!user)throw fail('Sign in with your participant access code.');return user;},
    allowInference(user) {if(hosted)limit(usage,user.id,60,3600000);},
    login(req,code,res) {
      if(!hosted)return {hosted:false};
      // Global bounded throttling is deliberately independent of spoofable proxy headers.
      limit(attempts,'login',30,15*60000);
      const hash=digest(code),account=accounts.find(user=>timingSafeEqual(hash,Buffer.from(user.tokenHash,'hex')));
      if(!account)throw fail('That access code was not recognized.');
      const value={id:account.id,version:account.tokenHash.slice(0,16),csrf:randomBytes(24).toString('base64url'),expires:now()+7*86400000};
      const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
      res.setHeader('Set-Cookie',`cq_session=${payload}.${sign(payload)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
      return {hosted:true,user:{id:account.id,namespace:accountNamespace(account.id)}};
    },
    logout(res) {res.setHeader('Set-Cookie','cq_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0');},
  };
}
