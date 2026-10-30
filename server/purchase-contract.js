import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const purchaseSchema=JSON.parse(readFileSync(new URL('../contracts/purchase-extraction.schema.json',import.meta.url),'utf8'));
export const IMPORT_LIMITS=Object.freeze({characters:12000,lines:200,rows:30,quantity:10,units:50,queue:8,retained:100});
export const garmentCategories=['Top','Bottom','Dress','Shoes','Outerwear','Accessory'];
export const fail=(message,code='EXTRACTION_INVALID_OUTPUT',status=400)=>Object.assign(new Error(message),{code,status});
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function exactKeys(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!(k in value)))throw fail('Unexpected or missing fields.');
}
export function normalizePurchaseText(text){
 if(typeof text!=='string')throw fail('Paste purchase text.','IMPORT_INVALID_INPUT');
 const normalized=text.replace(/\r\n?/g,'\n').normalize('NFC');
 if(normalized.includes('\0'))throw fail('Remove null characters from this text.','IMPORT_INVALID_INPUT');
 if(!normalized.trim())throw fail('Paste at least one clothing line.','IMPORT_INVALID_INPUT');
 if(normalized.length>IMPORT_LIMITS.characters||normalized.split('\n').length>IMPORT_LIMITS.lines)throw fail('Use at most 12,000 characters and 200 lines.','IMPORT_LIMIT_EXCEEDED',413);
 return {text:normalized,hash:hash(normalized),lines:normalized.split('\n').map((text,i)=>({id:`L${i+1}`,text}))};
}
const text=(x,max=160)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const fields=['description','category','color','size','brand','quantity'];
export function validateReviewed(v,{allowUnknownQuantity=true}={}){
 exactKeys(v,fields);
 if(!text(v.description)||!garmentCategories.includes(v.category))throw fail('Give the piece a name and supported clothing category.');
 for(const k of ['color','size','brand'])if(v[k]!==null&&!text(v[k],80))throw fail(`Invalid ${k}.`);
 if(!(allowUnknownQuantity&&v.quantity===null)&&(!Number.isInteger(v.quantity)||v.quantity<1||v.quantity>10))throw fail('Quantity must be a whole number from 1 to 10.','IMPORT_INVALID_QUANTITY');
 return structuredClone(v);
}
export function validateExtraction(value,source){
 exactKeys(value,['schema_version','items','excluded_lines','warnings']);
 if(value.schema_version!=='1'||!Array.isArray(value.items)||value.items.length>30||!Array.isArray(value.excluded_lines)||value.excluded_lines.length>200||!Array.isArray(value.warnings)||value.warnings.length>20||value.warnings.some(w=>!text(w,300)))throw fail('Invalid extraction shape or limits.');
 const lines=new Map(source.lines.map(l=>[l.id,l.text]));
 const seen=new Set();
 for(const item of value.items){
  exactKeys(item,[...fields,'source_line_ids','review_reasons','evidence']);
  validateReviewed(Object.fromEntries(fields.map(k=>[k,item[k]])));
  if(!Array.isArray(item.source_line_ids)||!item.source_line_ids.length||item.source_line_ids.length>10||new Set(item.source_line_ids).size!==item.source_line_ids.length||item.source_line_ids.some(id=>!lines.has(id)))throw fail('Unknown source line.');
  const identity=JSON.stringify([[...item.source_line_ids].sort(),item.description]);if(seen.has(identity))throw fail('Duplicate prediction for the same source item.');seen.add(identity);
  if(!Array.isArray(item.review_reasons)||item.review_reasons.length>10||item.review_reasons.some(x=>!text(x,300))||!Array.isArray(item.evidence)||item.evidence.length>20)throw fail('Invalid review evidence.');
  for(const e of item.evidence){exactKeys(e,['field','line_id','quote']);if(!fields.includes(e.field)||!item.source_line_ids.includes(e.line_id)||!text(e.quote,500)||!lines.get(e.line_id).includes(e.quote))throw fail('An evidence quote is absent from its source line.');}
  for(const field of fields){
   if(item[field]===null)continue;
   const proofs=item.evidence.filter(e=>e.field===field);
   if(!proofs.length)throw fail(`Missing evidence for ${field}.`);
   if(field!=='category'&&!proofs.some(e=>field==='quantity'?new RegExp(`(^|\\D)${item[field]}(\\D|$)`).test(e.quote):e.quote.toLocaleLowerCase().includes(String(item[field]).toLocaleLowerCase())))throw fail(`Unsupported ${field}.`);
  }
  // Category is a normalized interpretation, not a literal quote. Human review is mandatory.
  if(item.review_reasons.length<10&&!item.review_reasons.includes('Confirm category mapping'))item.review_reasons.push('Confirm category mapping');
 }
 for(const x of value.excluded_lines){exactKeys(x,['line_id','reason']);if(!lines.has(x.line_id)||!['header','shipping','tax','discount','non_clothing','ambiguous','instruction','return'].includes(x.reason))throw fail('Invalid excluded line.');}
 return structuredClone(value);
}
export function validateKey(key){if(typeof key!=='string'||!/^[-\w]{8,100}$/.test(key))throw fail('Provide a stable idempotency key.','IMPORT_INVALID_KEY');return key;}
export function reviewedFields(item){return Object.fromEntries(fields.map(k=>[k,item[k]]));}
export function toGarment(item,importId,unit,id,at){
 return {id,name:item.reviewed.description,category:item.reviewed.category,colorName:item.reviewed.color||'Unknown',color:null,size:item.reviewed.size,brand:item.reviewed.brand,tags:'',wears:0,addedAt:at,needsReview:false,image:null,purchaseImport:{id:importId,itemId:item.id,unit},source:'Reviewed purchase text',appearanceUnknown:true};
}
