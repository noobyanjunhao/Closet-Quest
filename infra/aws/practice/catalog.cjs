// Isolated practice handler. Synthetic data only; no model, retailer or secret access.
const {DynamoDBClient,GetItemCommand,PutItemCommand}=require('@aws-sdk/client-dynamodb');
const fixtures=Object.freeze({
  Top:{id:'practice-top',name:'Synthetic cotton shirt',category:'Top'},
  Bottom:{id:'practice-bottom',name:'Synthetic straight trousers',category:'Bottom'},
  Shoes:{id:'practice-shoes',name:'Synthetic loafers',category:'Shoes'},
});
function createHandler({client,table,now=Date.now,log=()=>{}}){
  if(!table)throw Error('PRACTICE_TABLE is required');
  const send=command=>client.send(command,{abortSignal:AbortSignal.timeout(3000)});
  return async(event={})=>{
    const category=event.category??'Top';
    if(typeof category!=='string'||!Object.hasOwn(fixtures,category)||Object.keys(event).some(k=>k!=='category'))
      throw Error('Use only category: Top, Bottom, or Shoes; do not submit personal data.');
    const timestamp=Math.floor(now()/1000),Key={pk:{S:'practice-v1#'+category}};
    const read=async()=>{
      const {Item}=await send(new GetItemCommand({TableName:table,Key,ConsistentRead:true}));
      if(!Item||Number(Item.expiresAt?.N)<=timestamp||!Number.isFinite(Number(Item.expiresAt?.N)))return null;
      try{const item=JSON.parse(Item.payload.S);return JSON.stringify(item)===JSON.stringify(fixtures[category])?item:null;}catch{return null;}
    };
    const started=now();let cached=Boolean(await read()),reusedAfterRace=false;
    if(!cached){
      try{await send(new PutItemCommand({TableName:table,Item:{...Key,payload:{S:JSON.stringify(fixtures[category])},expiresAt:{N:String(timestamp+900)}},ConditionExpression:'attribute_not_exists(pk) OR expiresAt <= :now',ExpressionAttributeValues:{':now':{N:String(timestamp)}}}));}
      catch(error){
        if(error.name!=='ConditionalCheckFailedException')throw error;
        if(!await read())throw Error('Practice cache contains unexpected data; inspect this isolated table.');
        cached=true;reusedAfterRace=true;
      }
    }
    const result={synthetic:true,item:{...fixtures[category]},cached,reusedAfterRace,elapsedMs:Math.max(0,now()-started)};
    log(JSON.stringify({event:'practice_catalog',category,cached,reusedAfterRace,elapsedMs:result.elapsedMs}));
    return result;
  };
}
let run;
exports.handler=async event=>{
  run??=createHandler({client:new DynamoDBClient({maxAttempts:1}),table:process.env.PRACTICE_TABLE,log:console.log});
  return run(event);
};
exports.createHandler=createHandler;
