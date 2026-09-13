import { writeFileSync } from 'node:fs';
// Original, authored metadata fixtures. No real people, photos, or user labels.
const contexts = ['Campus casual','Coffee date','Presentation day'];
const catalog = [
  ['Cotton tee','Top',[0,1]],['Oxford shirt','Top',[1,2]],['Knit sweater','Top',[0,1,2]],['Graphic tee','Top',[0]],
  ['Blue jeans','Bottom',[0,1]],['Linen trousers','Bottom',[0,1,2]],['Tailored trousers','Bottom',[2]],['Cargo pants','Bottom',[0]],
  ['White sneakers','Shoes',[0,1]],['Leather loafers','Shoes',[1,2]],['Canvas sneakers','Shoes',[0]],['Ankle boots','Shoes',[1,2]],
  ['Cotton dress','Dress',[0,1]],['Midi dress','Dress',[1,2]],['Blazer','Outerwear',[2]],['Cardigan','Outerwear',[0,1,2]],
];
const scenarios = ['balanced','context-conflict','dress-only','missing-shoes','sparse','unknown-tags','all-used','mixed-case','dress-alternative','mislabeled'];
let seed = 20260913;
function random() { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }
const wardrobes = [];
for (const scenario of scenarios) for (let variant = 0; variant < 3; variant++) {
  let items = catalog.map(([name,category,tags],index) => ({id:`g${index}`,name,category,tags:tags.map(i=>contexts[i]).join(', '),wears:Math.floor(random()*12),color:'#808080'}));
  if(scenario==='context-conflict') items=items.map(i=>({...i,wears:i.tags.includes('Presentation day')?10:0}));
  if(scenario==='dress-only') items=items.filter(i=>!['Top','Bottom'].includes(i.category));
  if(scenario==='missing-shoes') items=items.filter(i=>i.category!=='Shoes');
  if(scenario==='sparse') items=items.filter((_,i)=>[0,4,8].includes(i));
  if(scenario==='unknown-tags') items=items.map(i=>({...i,tags:''}));
  if(scenario==='all-used') items=items.map(i=>({...i,wears:i.wears+2}));
  if(scenario==='mixed-case') items=items.map(i=>({...i,tags:i.tags.toUpperCase().replaceAll(', ', ' ,  ')}));
  if(scenario==='dress-alternative') items=items.map(i=>({...i,tags:['Top','Bottom'].includes(i.category)?'Campus casual':i.tags}));
  if(scenario==='mislabeled') items=items.map(i=>({...i,category:i.category==='Shoes'?'Accessory':i.category}));
  wardrobes.push({id:`${scenario}-${variant+1}`,scenario,items});
}
const queries=wardrobes.flatMap(w=>contexts.flatMap(context=>[false,true].map(requireLowUse=>({id:`${w.id}-${contexts.indexOf(context)}-${requireLowUse?'quest':'style'}`,wardrobeId:w.id,context,requireLowUse}))));
writeFileSync(new URL('./data/wardrobes.json',import.meta.url),JSON.stringify({schemaVersion:1,seed:20260913,provenance:'Original deterministic synthetic wardrobe metadata authored for Sprint 3. Not observations of users and not an independent fashion-quality dataset.',wardrobes,queries},null,2)+'\n');
console.log(`Wrote ${wardrobes.length} wardrobes and ${queries.length} queries.`);
