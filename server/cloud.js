import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {BUILTIN_STYLE_DOCUMENTS,KNOWLEDGE_LIMITS,chunkKnowledgeText} from './knowledge.js';

const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const error=(message,status=503,code='CLOUD_UNAVAILABLE')=>Object.assign(new Error(message),{status,code});
export const cloudConfigured=()=>Boolean(process.env.SUPABASE_URL||process.env.SUPABASE_PUBLISHABLE_KEY);
export function validateCloudState(value,userId) {
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.items)||value.items.length>300||!Array.isArray(value.completed)||!Array.isArray(value.submissions)||!Number.isFinite(value.xp)||typeof value.profile!=='string'||value.profile.length>80)throw error('This wardrobe backup is not valid.',400,'INVALID_CLOSET');
 const clean=structuredClone(value);clean.wardrobeId=userId;clean.learningEnabled=false;
 const ids=new Set();
 for(const item of clean.items){
  if(!item||typeof item.id!=='string'||item.id.length>100||ids.has(item.id)||typeof item.name!=='string'||item.name.length>500)throw error('Some wardrobe pieces are not valid.',400,'INVALID_CLOSET');
  ids.add(item.id);
  for(const image of [item.image,item.originalImage,item.cutoutImage])if(image&&!/^photos\/[\w-]+\.(jpg|png|webp)$/.test(image)&&!/^\/api\/cloud\/photos\/[a-f0-9]{64}\.(jpg|png)$/.test(image))throw error('Upload photos before syncing your closet.',400,'UNSAVED_PHOTO');
 }
 if(Buffer.byteLength(JSON.stringify(clean))>1900000)throw error('Your wardrobe history is too large to sync. Export a backup first.',413,'CLOSET_TOO_LARGE');
 return clean;
}
export function createCloud({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,origin=process.env.CLOSET_PUBLIC_ORIGIN,fetchImpl=fetch}={}) {
 if(!url&&!key)return null;
 let parsed;try{parsed=new URL(url);}catch{throw Error('Set a valid SUPABASE_URL.');}
 if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.supabase.co')||parsed.origin!==url||typeof key!=='string'||key.length<20)throw Error('Configure the Supabase HTTPS project URL and publishable key together.');
 // Use the publishable/anon key only. User JWTs and RLS authorize every data request.
 if(key.startsWith('sb_secret_'))throw Error('Use the publishable key, never a Supabase service secret.');
 let keyRole;try{keyRole=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url')).role;}catch{}
 if(keyRole&&keyRole!=='anon')throw Error('Use the publishable key, never a Supabase service secret.');
 const refreshes=new Map(),attempts=new Map();
 const publicUser=u=>({id:u.id,namespace:u.id,email:u.email,cloud:true});
 const cookie=(req,name)=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
 async function request(path,{token,method='GET',body,headers={},raw=false}={}){
  let r;try{r=await fetchImpl(url+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)});}catch{throw error('Cloud connection interrupted. Your local changes are safe.');}
  if(!r.ok){let data;try{data=await r.json();}catch{}const conflict=r.status===409;
   throw error(r.status===401||r.status===403?'Your session expired. Please sign in again.':r.status===429?'Too many attempts. Please wait before trying again.':conflict?'This record changed on another device.':r.status===400||r.status===422?'Check your details and email confirmation, then try again.':'Cloud service unavailable. Please try again.',r.status, data?.code==='email_not_confirmed'?'EMAIL_NOT_CONFIRMED':conflict?'CLOUD_CONFLICT':'CLOUD_REQUEST_FAILED');
  }
  if(raw)return r;const text=await r.text();return text?JSON.parse(text):null;
 }
 function setSession(res,tokens){
  if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||tokens.access_token.length>12000||tokens.refresh_token.length>1000)throw error('Authentication did not return a valid session.');
  const suffix=`Path=/api; HttpOnly; SameSite=Lax; ${origin?'Secure; ':''}`;
  res.setHeader('Set-Cookie',[`cq_access=${tokens.access_token}; ${suffix}Max-Age=604800`,`cq_refresh=${tokens.refresh_token}; ${suffix}Max-Age=604800`]);
 }
 function clearSession(res){const suffix=`Path=/api; HttpOnly; SameSite=Lax; ${origin?'Secure; ':''}Max-Age=0`;res.setHeader('Set-Cookie',[`cq_access=; ${suffix}`,`cq_refresh=; ${suffix}`]);}
 async function authenticate(req,res){
  let token=cookie(req,'cq_access'),refresh=cookie(req,'cq_refresh');
  if(!token&&!refresh)return null;
  if(token?.length>12000||refresh?.length>1000)return null;
  if(token)try{const u=await request('/auth/v1/user',{token});if(!uuid.test(u?.id))return null;return {...publicUser(u),token};}catch(e){if(![401,403].includes(e.status))throw e;}
  if(!refresh){clearSession(res);return null;}
  const hash=createHash('sha256').update(refresh).digest('hex');
  for(const [k,v] of refreshes)if(v.until<Date.now())refreshes.delete(k);
  if(refreshes.size>1000)throw error('Sign-in service is busy. Try again.');
  if(!refreshes.has(hash))refreshes.set(hash,{until:Date.now()+5000,promise:request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}})});
  try{const tokens=await refreshes.get(hash).promise;setSession(res,tokens);const u=await request('/auth/v1/user',{token:tokens.access_token});if(!uuid.test(u?.id))throw error('Invalid account.',401);return {...publicUser(u),token:tokens.access_token};}catch(e){if([400,401,403].includes(e.status)){clearSession(res);return null;}throw e;}
 }
 function limit(){const now=Date.now();for(const[k,v]of attempts)if(v.until<now)attempts.delete(k);const b=attempts.get('auth')||{count:0,until:now+600000};if(++b.count>60)throw error('Too many sign-in attempts. Please wait.',429);attempts.set('auth',b);}
 async function auth(action,input,req,res){
  limit();
  if(action==='logout'){const token=cookie(req,'cq_access');if(token)try{await request('/auth/v1/logout?scope=local',{method:'POST',token});}catch{}clearSession(res);return {};}
  if(action==='exchange'){
   if(typeof input.access_token!=='string'||input.access_token.length>12000||typeof input.refresh_token!=='string'||input.refresh_token.length>1000)throw error('This confirmation link is not valid.',400);
   const u=await request('/auth/v1/user',{token:input.access_token});if(!uuid.test(u?.id))throw error('Invalid account.',401);setSession(res,input);return {hosted:true,authMode:'account',user:publicUser(u)};
  }
  if(action==='password'){
   const user=await authenticate(req,res);if(!user)throw error('Open the reset link from your email first.',401);validatePassword(input.password);
   await request('/auth/v1/user',{method:'PUT',token:user.token,body:{password:input.password}});return {ok:true};
  }
  const email=String(input.email||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw error('Enter a valid email address.',400,'INVALID_EMAIL');
  const redirect=origin||`http://${req.headers.host}`;
  if(action==='recover'){await request('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{method:'POST',body:{email}});return {message:'If an account exists, a reset link is on its way. Check your inbox.'};}
  if(action==='signup')validatePassword(input.password);
  else if(typeof input.password!=='string'||!input.password||input.password.length>256)throw error('Enter your password.',400);
  if(!['signup','login'].includes(action))throw error('Not found.',404);
  const data=await request(action==='signup'?'/auth/v1/signup?redirect_to='+encodeURIComponent(redirect):'/auth/v1/token?grant_type=password',{method:'POST',body:{email,password:input.password}});
  if(!data?.access_token)return {message:'Check your email to confirm your account, then sign in.'};
  setSession(res,data);return {hosted:true,authMode:'account',user:publicUser(data.user)};
 }
 function validatePassword(value){if(typeof value!=='string'||value.length<10||value.length>256)throw error('Use a password with at least 10 characters.',400,'WEAK_PASSWORD');}
 async function closet(user){const rows=await request(`/rest/v1/closets?user_id=eq.${user.id}&select=state,revision,updated_at`,{token:user.token});return rows[0]||{state:null,revision:0};}
 async function saveCloset(user,input){
  if(!Number.isSafeInteger(input.revision)||input.revision<0)throw error('Invalid sync revision.',400);
  const state=validateCloudState(input.state,user.id);
  const rows=await request('/rest/v1/rpc/save_closet',{token:user.token,method:'POST',body:{next_state:state,expected_revision:input.revision}});
  if(!rows?.length)throw error('Your closet changed on another device. Reload its latest version or export your local changes.',409,'SYNC_CONFLICT');return {revision:rows[0].revision,updated_at:rows[0].updated_at};
 }
 async function uploadPhoto(user,image){
  if(typeof image!=='string'||image.length>3000000||!/^data:image\/(jpeg|png|webp);base64,/.test(image))throw error('Choose a JPEG, PNG or WebP photo under 2 MB.',400,'INVALID_PHOTO');
  const bytes=Buffer.from(image.split(',')[1],'base64');if(bytes.length>2097152)throw error('Photo too large.',413);
  let normalized,transparent;try{const input=sharp(bytes,{limitInputPixels:16000000});transparent=(await input.metadata()).hasAlpha;const resized=input.rotate().resize({width:transparent?700:1200,height:transparent?700:1200,fit:'inside',withoutEnlargement:true});normalized=await (transparent?resized.png():resized.jpeg({quality:85})).toBuffer();}catch{throw error('This photo could not be read.',400,'INVALID_PHOTO');}
  if(normalized.length>2097152)throw error('The cutout is too large to save. Use a smaller photo.',413);
  const id=createHash('sha256').update(normalized).digest('hex')+(transparent?'.png':'.jpg');
  await request(`/storage/v1/object/closet-photos/${user.id}/${id}`,{method:'POST',token:user.token,body:normalized,headers:{'Content-Type':transparent?'image/png':'image/jpeg','x-upsert':'true'}});return {image:`/api/cloud/photos/${id}`};
 }
 async function photo(user,id){if(!/^[a-f0-9]{64}\.(jpg|png)$/.test(id))throw error('Photo not found.',404);return request(`/storage/v1/object/authenticated/closet-photos/${user.id}/${id}`,{token:user.token,raw:true});}
 async function documents(user){return request(`/rest/v1/style_documents?user_id=eq.${user.id}&select=id,title,content,source,updated_at`,{token:user.token});}
 async function saveDocument(user,doc){
  const all=await documents(user),id=doc.id||randomUUID();
  if(!uuid.test(id)||typeof doc.title!=='string'||!doc.title.trim()||doc.title.length>160||typeof doc.content!=='string'||!doc.content.trim()||doc.content.length>20000||String(doc.source||'').length>300)throw error('Provide a title and a note under 20,000 characters.',400);
  const limit=KNOWLEDGE_LIMITS.documents-BUILTIN_STYLE_DOCUMENTS.length;
  if(all.length>=limit&&!all.some(d=>d.id===id))throw error(`Your library can hold ${limit} personal documents.`,400);
  const passages=[...BUILTIN_STYLE_DOCUMENTS,...all.filter(d=>d.id!==id),doc].reduce((sum,d)=>sum+chunkKnowledgeText(d.content).length,0);
  if(passages>KNOWLEDGE_LIMITS.chunks)throw error('Your style library is full. Shorten or remove a note before adding another.',413,'KNOWLEDGE_LIMIT');
  await request('/rest/v1/style_documents?on_conflict=user_id,id',{method:'POST',token:user.token,headers:{Prefer:'resolution=merge-duplicates'},body:{user_id:user.id,id,title:doc.title.trim(),content:doc.content,source:doc.source||'Personal style note',updated_at:new Date().toISOString()}});return {...doc,id};
 }
 async function removeDocument(user,id){if(!uuid.test(id))throw error('Invalid document.',400);await request(`/rest/v1/style_documents?user_id=eq.${user.id}&id=eq.${id}`,{method:'DELETE',token:user.token});return {removed:true};}
 return {authenticate,publicUser,auth,closet,saveCloset,uploadPhoto,photo,documents,saveDocument,removeDocument};
}
