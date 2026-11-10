import {configuredCatalogStore} from '../../server/catalog-store.js';
import {createShoppingSearch} from '../../server/shopping.js';

// One public category/day; no images, accounts, briefs or wardrobe IDs in this job.
export async function refreshCatalog({store,search,now=Date.now}={}){
  const day=Math.floor(now()/86400000),categories=['Top','Bottom','Shoes','Dress','Outerwear','Accessory'];
  const query={category:categories[day%6],occasion:Math.floor(day/6)%2?'formal':'everyday',presentation:'any',maxPrice:null};
  const started=now(),result=await store.getOrRefresh(query,()=>search(query,{scope:'public-product-library'}));
  return {category:query.category,products:result.products.length,cached:Boolean(result.distributedCached),elapsedMs:now()-started};
}
export async function handler(){
  const {SecretsManagerClient,GetSecretValueCommand}=await import('@aws-sdk/client-secrets-manager');
  const r=await new SecretsManagerClient({maxAttempts:2}).send(new GetSecretValueCommand({SecretId:process.env.CATALOG_SECRET_ARN}),{abortSignal:AbortSignal.timeout(4000)});
  let apiKey;try{apiKey=JSON.parse(r.SecretString).OPENAI_API_KEY;}catch{throw Error('Catalog secret must be JSON with OPENAI_API_KEY.');}
  if(typeof apiKey!=='string'||!apiKey.trim())throw Error('Catalog API credential is missing.');
  const result=await refreshCatalog({store:configuredCatalogStore(),search:createShoppingSearch({apiKey})});
  console.log(JSON.stringify({event:'catalog_refresh',...result}));return result;
}

