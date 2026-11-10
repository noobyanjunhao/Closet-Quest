import {createHash,randomUUID} from 'node:crypto';
import {shoppingQuery} from './shopping.js';
import {validateLibraryEntry,SHOPPING_FRESH_MS,SHOPPING_MAX_AGE_MS} from './shopping-library.js';

export const catalogKey=q=>'catalog#'+createHash('sha256').update(JSON.stringify(shoppingQuery(q))).digest('hex');
const unavailable=()=>Object.assign(Error('The shared shop catalog is refreshing. Try again shortly.'),{status:503,code:'CATALOG_REFRESHING',retryable:true,retryAfter:5});

// Dependency-injected transport keeps conditional-write semantics testable without
// AWS credentials. Only public shoppingQuery fields and validated product data cross
// this boundary. Private account-library records are never passed to this store.
export function createCatalogStore({transport,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),waitMs=3500,leaseMs=45000}={}) {
  return {async getOrRefresh(input,refresh){
    const query=shoppingQuery(input),key=catalogKey(query),token=randomUUID();
    const matches=clean=>clean&&JSON.stringify(clean.query)===JSON.stringify(query);
    const read=async()=>{const row=await transport.get(key);const clean=validateLibraryEntry(row?.value,now());return matches(clean)&&now()-Date.parse(clean.searchedAt)<SHOPPING_FRESH_MS?{...clean,distributedCached:true}:null;};
    const hit=await read();if(hit)return hit;
    if(!await transport.claim(key,token,now(),leaseMs)){
      const stop=now()+waitMs;do{await sleep(Math.min(200,waitMs));const hit=await read();if(hit)return hit;}while(now()<stop);
      throw unavailable();
    }
    try{
      const clean=validateLibraryEntry(await refresh(),now());if(!matches(clean))throw unavailable();
      // Fencing token plus lease expiry prevents a slow obsolete worker overwriting
      // a newer owner's result. TTL is cleanup only, never a freshness guarantee.
      await transport.commit(key,token,clean,now(),Math.floor((Date.parse(clean.searchedAt)+SHOPPING_MAX_AGE_MS)/1000));
      return clean;
    }finally{await transport.release(key,token).catch(()=>{});}
  }};
}

export function createDynamoTransport({client,commands,table}={}) {
  if(!/^[\w.-]{3,255}$/.test(table||''))throw Error('Set a valid CLOSET_CATALOG_TABLE.');
  const send=(name,input)=>client.send(new commands[name]({TableName:table,...input}),{abortSignal:AbortSignal.timeout(4000)});
  const key=pk=>({pk:{S:pk}});
  const number=n=>({N:String(n)});
  return {
    async get(pk){const r=await send('GetItemCommand',{Key:key(pk),ConsistentRead:true});try{return {value:JSON.parse(r.Item?.payload?.S||'null')};}catch{return null;}},
    async claim(pk,token,now,leaseMs){try{await send('UpdateItemCommand',{Key:key(pk),UpdateExpression:'SET leaseToken = :token, leaseUntil = :until, expiresAt = if_not_exists(expiresAt, :ttl)',ConditionExpression:'attribute_not_exists(leaseUntil) OR leaseUntil < :now',ExpressionAttributeValues:{':token':{S:token},':until':number(now+leaseMs),':now':number(now),':ttl':number(Math.floor((now+SHOPPING_MAX_AGE_MS)/1000))}});return true;}catch(e){if(e.name==='ConditionalCheckFailedException')return false;throw e;}},
    async commit(pk,token,value,now,ttl){await send('UpdateItemCommand',{Key:key(pk),UpdateExpression:'SET payload = :payload, expiresAt = :ttl REMOVE leaseToken, leaseUntil',ConditionExpression:'leaseToken = :token AND leaseUntil >= :now',ExpressionAttributeValues:{':payload':{S:JSON.stringify(value)},':ttl':number(ttl),':token':{S:token},':now':number(now)}});},
    async release(pk,token){try{await send('UpdateItemCommand',{Key:key(pk),UpdateExpression:'REMOVE leaseToken, leaseUntil',ConditionExpression:'leaseToken = :token',ExpressionAttributeValues:{':token':{S:token}}});}catch(e){if(e.name!=='ConditionalCheckFailedException')throw e;}},
  };
}

export function configuredCatalogStore(){
  if(!process.env.CLOSET_CATALOG_TABLE)return undefined;
  let store;
  return {async getOrRefresh(...args){
    if(!store)store=(async()=>{const commands=await import('@aws-sdk/client-dynamodb');return createCatalogStore({transport:createDynamoTransport({client:new commands.DynamoDBClient({region:process.env.AWS_REGION||'us-east-1',maxAttempts:2}),commands,table:process.env.CLOSET_CATALOG_TABLE})});})();
    return (await store).getOrRefresh(...args);
  }};
}

