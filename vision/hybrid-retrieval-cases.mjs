// Authored semantic-retrieval probes, separate from the ranker's training corpus.
// Expected items are human-authored relevance labels, not observed wearer preferences.
const definitions=[
  {id:'reading-knit',request:'Something snug for indoor reading',category:'Top',target:{name:'Cable-knit pullover',itemType:'Sweater',fit:'Relaxed',materialAppearance:'Soft wool-like texture',tags:'Cozy, textured'},noise:['Structured poplin shirt','Sequined evening blouse','Performance running singlet','Graphic crew neck tee','Satin camisole','Cropped utility overshirt']},
  {id:'interview-blazer',request:'For an internship interview with a finance firm',category:'Outerwear',target:{name:'Charcoal tailored blazer',itemType:'Blazer',fit:'Structured',tags:'Presentation day, polished'},noise:['Hooded trail anorak','Fleece zip jacket','Racing jacket','Quilted puffer coat','Oversized denim jacket','Sleeveless utility vest']},
  {id:'trekking-boots',request:'Footwear for trekking over uneven ground',category:'Shoes',target:{name:'Rugged hiking boots',itemType:'Boots',tags:'Outdoor, sturdy, ankle support'},noise:['Patent ballet flats','Canvas court sneakers','Suede loafers','Strappy evening sandals','Minimal leather slides','Satin party heels']},
  {id:'shoulder-straps',request:'Something carried with straps over both shoulders',category:'Accessory',target:{name:'Canvas rucksack',itemType:'Backpack',tags:'Books, university, practical'},noise:['Silk neck scarf','Woven waist belt','Brass bracelet','Small evening clutch','Sun visor','Leather coin purse']},
  {id:'august-coast',request:'For August afternoons at the coast',category:'Bottom',target:{name:'Light linen drawstring shorts',itemType:'Shorts',fit:'Relaxed',tags:'Airy, warm weather'},noise:['Heavy corduroy trousers','Wool pleated trousers','Coated skinny jeans','Structured pencil skirt','Fleece joggers','Velvet evening trousers']},
  {id:'ankle-hem',request:'One piece with a hem close to the ankles',category:'Dress',target:{name:'Long flowing maxi dress',itemType:'Dress',fit:'Relaxed',tags:'Full length, flowing'},noise:['Mini slip dress','Knee length shift dress','Short skater dress','Above knee shirt dress','Mini wrap dress','Short sleeveless tunic dress']},
  {id:'five-pockets',request:'The classic five-pocket cotton twill pants',category:'Bottom',target:{name:'Indigo denim jeans',itemType:'Jeans',fit:'Straight leg',materialAppearance:'Denim',tags:'Everyday, five pockets'},noise:['Pleated wool trousers','Silk wide leg trousers','Stretch running leggings','Short tennis skirt','Light linen shorts','Fleece track pants']},
  {id:'downpour-layer',request:'An extra layer for a downpour',category:'Outerwear',target:{name:'Hooded waterproof shell',itemType:'Jacket',tags:'Rain, weather protection',materialAppearance:'Waterproof shell, authored test metadata'},noise:['Wool dress coat','Linen blazer','Suede cropped jacket','Open knit cardigan','Velvet evening jacket','Cotton utility vest']},
];

export function hybridRetrievalCases() {
  return definitions.map(definition=>{
    const base=[{id:'base-top',name:'Plain tee',category:'Top',wears:3},{id:'base-bottom',name:'Plain trousers',category:'Bottom',wears:3},{id:'base-shoes',name:'Plain sneakers',category:'Shoes',wears:3}];
    const distractors=Array.from({length:60},(_,index)=>({id:`${definition.id}-d${index}`,name:definition.noise[index%definition.noise.length],category:definition.category,colorName:['Black','White','Green','Brown','Pink'][Math.floor(index/definition.noise.length)%5],wears:5}));
    const targetId=definition.id+'-target';
    return {id:definition.id,request:definition.request,context:'',expectedIds:[targetId],items:[...base,...distractors,{id:targetId,category:definition.category,wears:1,...definition.target}]};
  });
}
