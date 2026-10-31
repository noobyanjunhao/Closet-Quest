import {validateExtraction} from './purchase-contract.js';
// Cheap, source-grounded fallback. It is explicitly NOT model inference.
const types={tee:'Top',shirt:'Top',cardigan:'Top',trousers:'Bottom',jeans:'Bottom',skirt:'Bottom',dress:'Dress',sneakers:'Shoes',loafers:'Shoes',boots:'Shoes',coat:'Outerwear',jacket:'Outerwear',cap:'Accessory',scarf:'Accessory'};
export function rulePurchaseProvider(source){
 const start=performance.now(),items=[],excluded_lines=[];
 for(const {id:lid,text:line} of source.lines){
  const lower=line.toLowerCase();const reason=[['ignore','instruction'],['shipping','shipping'],['tax','tax'],['discount','discount'],['gift card','non_clothing'],['mug','non_clothing'],['merchant','header']].find(([k])=>lower.includes(k))?.[1];
  if(reason){excluded_lines.push({line_id:lid,reason});continue;}
  const match=Object.entries(types).find(([k])=>new RegExp(`\\b${k}\\b`).test(lower));
  if(!match){excluded_lines.push({line_id:lid,reason:'ambiguous'});continue;}
  const description=line.split(',')[0].split('|')[0].trim();
  const fields={description,category:match[1]};
  for(const field of ['color','size','brand','quantity']){const m=line.match(new RegExp(`\\b${field}\\s*:\\s*([\\w-]+)`,'i'));fields[field]=m?(field==='quantity'&&/^\d+$/.test(m[1])?Number(m[1]):m[1]):null;}
  const at=lower.indexOf(match[0]);const evidence=[{field:'description',line_id:lid,quote:description},{field:'category',line_id:lid,quote:line.slice(at,at+match[0].length)},...['color','size','brand','quantity'].filter(k=>fields[k]!==null).map(k=>({field:k,line_id:lid,quote:String(fields[k])}))];
  items.push({...fields,source_line_ids:[lid],review_reasons:lower.includes('return')?['Confirm return ownership']:[],evidence});
 }
 const data=validateExtraction({schema_version:'1',items,excluded_lines,warnings:['Fast parser result: check names, missing details and quantities.']},source);
 return {data,metadata:{provider:'rules',model:'purchase-rules-v1',schemaVersion:'1',promptVersion:'none',latencyMs:performance.now()-start,training:false,fallbackReason:'Private inference worker offline'}};
}
