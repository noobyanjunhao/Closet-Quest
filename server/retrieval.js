import { PipelineError } from './recognition.js';

export const RETRIEVAL_VERSION = 'wardrobe-bm25-v1';
export const WARDROBE_CATEGORIES = ['Top', 'Bottom', 'Dress', 'Shoes', 'Outerwear', 'Accessory'];
const MAX_RETRIEVED = 18;
const layeringReference = Object.freeze({title:'UNIQLO — The Modern Layering Guide',url:'https://www.uniqlo.com/us/en/contents/lifewear-magazine/the-modern-layering-guide/',type:'authored-interpretation',reviewedAt:'2026-09-22'});
const stringFields = ['name', 'color', 'colorName', 'pattern', 'fit', 'materialAppearance', 'itemType'];
const listFields = ['tags', 'styleTags', 'occasions'];
const stopWords = new Set('a an the and or for to of in on at with my me i it this that some please outfit look wear wearing make want need would like'.split(' '));
// These are transparent vocabulary expansions, not vector embeddings or learned similarity.
const synonymGroups = [
  ['tee', 'tshirt', 'shirt', 'top'], ['pants', 'trousers', 'bottom'], ['jeans', 'denim'],
  ['sneakers', 'trainers', 'sneaker'], ['shoes', 'footwear'], ['knit', 'knitted', 'sweater', 'jumper'],
  ['jacket', 'coat', 'outerwear'], ['bag', 'tote', 'handbag'],
  ['formal', 'polished', 'office', 'presentation', 'business', 'tailored', 'smart'],
  ['casual', 'campus', 'relaxed', 'everyday', 'comfortable'], ['date', 'coffee', 'dinner'],
  ['cold', 'winter', 'warm', 'warmth', 'layer', 'layering'], ['hot', 'summer', 'lightweight', 'breezy'],
  ['blue', 'navy', 'indigo'], ['beige', 'cream', 'tan', 'neutral'], ['gray', 'grey'],
  ['rediscover', 'lowuse', 'unworn', 'underused'],
];

export const STYLE_GUIDES = Object.freeze([
  {id:'CQ-G01', title:'Build a complete outfit', keywords:'outfit balance silhouette proportion complete', text:'Start with one top and one bottom, or one dress, plus a pair of shoes. Add optional pieces deliberately. Describe only details recorded in the wardrobe; photos and fabric names do not establish comfort, weather protection or fiber content.'},
  {id:'CQ-G02', title:'A polished everyday look', keywords:'polished presentation office formal business tailored smart', text:'For a polished mood, consider recorded structured shapes, a simple color relationship and restrained accessories. A blazer can add structure when one is owned; formal dress codes remain the wearer’s decision.'},
  {id:'CQ-G03', title:'Easy casual combinations', keywords:'casual campus everyday coffee relaxed comfortable sneaker denim', text:'For a casual mood, pair a simple base with one detail such as texture, color or shape. Existing sneakers or relaxed pieces can be options when their recorded details support the request. Do not infer physical comfort from a photograph.'},
  {id:'CQ-G04', title:'Thoughtful layering', keywords:'cold winter warmth layer layering autumn outerwear sweater jacket coat', text:'For a layering request, consider one owned outer layer over the base outfit and describe the visible or recorded proportions. Ask the wearer to judge warmth and weather suitability; appearance alone cannot establish either.'},
  {id:'CQ-G05', title:'Keep warm-weather styling simple', keywords:'hot summer lightweight breezy warmweather', text:'For a warm-weather mood, consider fewer layers and recorded relaxed shapes. Describe a fabric as lightweight or breathable only if the wardrobe explicitly records that property; the wearer should verify practical suitability.'},
  {id:'CQ-G06', title:'Make color feel intentional', keywords:'color colour contrast monochrome neutral blue navy beige cream black white green red', text:'Build a repeatable color relationship: related hues, a contrasting accent, or a neutral base. Use the recorded color labels as approximate descriptions. Avoid claiming an exact visual match between pieces from those labels alone.'},
  {id:'CQ-G07', title:'Rediscover an underused piece', keywords:'rediscover lowuse unworn underused quest', text:'Choose at least one piece with zero or one recorded wear when rediscovery is requested. Ground the rest of the outfit around that piece using owned items. Recorded wears describe this app’s history, not an item’s lifetime use or condition.'},
  {id:'CQ-G08', title:'Style around a starting piece', keywords:'anchor starting favorite favourite selected', text:'Keep the selected starting piece in every outfit. Choose supporting pieces whose recorded colors, shapes and details suit the requested mood. Never substitute a different item for the starting piece.'},
  {id:'CQ-G09', title:'Tonal layers with texture', keywords:'tonal tone texture textures gradation monochrome', text:'For a tonal brief, consider nearby recorded color shades and a contrast in recorded surface texture. Similar colors need not match exactly. Use only owned pieces and documented details; a texture description does not verify fiber content.', source:layeringReference},
  {id:'CQ-G10', title:'Balance structure and ease', keywords:'structure structured ease tailoring tailored relaxed juxtaposition', text:'Consider one recorded structured shape alongside a relaxed piece when the brief welcomes that contrast. Let the outfit keep a clear focal point and a complete base. Treat these combinations as options for the wearer, not rules or proof of comfort.', source:layeringReference},
]);

function invalid(message, code='INVALID_STYLE_REQUEST') {
  return new PipelineError(message, {code, status:400});
}
function tokens(text='') {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/t[ -]shirts?/g, 'tshirt')
    .match(/[a-z0-9]+/g)?.filter(word => word.length > 1 && !stopWords.has(word)) || [];
}
function queryTerms(text) {
  const original = new Set(tokens(text));
  const weighted = new Map([...original].map(word => [word, 1]));
  for (const group of synonymGroups) {
    if (group.some(word => original.has(word))) for (const word of group) if (!weighted.has(word)) weighted.set(word, 0.45);
  }
  return weighted;
}
function listText(value) { return Array.isArray(value) ? value.join(' ') : value || ''; }
function itemText(item) {
  const identity = `${item.name || ''} ${item.itemType || ''} ${item.category}`;
  return `${identity} ${identity} ${stringFields.filter(key => !['name','itemType'].includes(key)).map(key => item[key] || '').join(' ')} ${listFields.map(key => listText(item[key])).join(' ')}`;
}
function rankDocuments(documents, query) {
  const tokenized = documents.map(document => tokens(document.text));
  const averageLength = tokenized.reduce((sum, words) => sum + words.length, 0) / Math.max(documents.length, 1) || 1;
  const frequencies = new Map();
  for (const words of tokenized) for (const word of new Set(words)) frequencies.set(word, (frequencies.get(word) || 0) + 1);
  return documents.map((document, index) => {
    const counts = new Map();
    for (const word of tokenized[index]) counts.set(word, (counts.get(word) || 0) + 1);
    let score = 0;
    const matches = [];
    for (const [word, weight] of query) {
      const frequency = counts.get(word) || 0;
      if (!frequency) continue;
      const inverseFrequency = Math.log(1 + (documents.length - frequencies.get(word) + 0.5) / (frequencies.get(word) + 0.5));
      score += weight * inverseFrequency * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * tokenized[index].length / averageLength));
      matches.push(word);
    }
    return {...document, score, matches};
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}

export function validateStyleRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Send a wardrobe and a styling request.');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200 || typeof body.request !== 'string' || body.request.length > 2000) {
    throw invalid('Use 1–200 garments and a request under 2,000 characters.');
  }
  if (body.context !== undefined && (typeof body.context !== 'string' || body.context.length > 160)) throw invalid('Use a context under 160 characters.');
  if (body.anchorId !== undefined && body.anchorId !== null && (typeof body.anchorId !== 'string' || !body.anchorId.trim() || body.anchorId.length > 120)) throw invalid('Choose a valid starting piece.');
  if (body.requireLowUse !== undefined && typeof body.requireLowUse !== 'boolean') throw invalid('The rediscovery setting must be true or false.');
  const ids = new Set();
  const items = body.items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 120 || ids.has(item.id)
      || !WARDROBE_CATEGORIES.includes(item.category) || !Number.isFinite(item.wears) || item.wears < 0
      || (item.needsReview !== undefined && typeof item.needsReview !== 'boolean')) throw invalid('Invalid wardrobe item. IDs must be unique, categories supported, and recorded wears nonnegative.');
    ids.add(item.id);
    const clean = {id:item.id, category:item.category, wears:item.wears};
    if (item.needsReview !== undefined) clean.needsReview = item.needsReview;
    for (const key of stringFields) {
      if (item[key] === undefined) continue;
      if (typeof item[key] !== 'string' || item[key].length > 500) throw invalid(`Invalid wardrobe ${key}.`);
      clean[key] = item[key].trim();
    }
    for (const key of listFields) {
      if (item[key] === undefined) continue;
      if (typeof item[key] === 'string' && item[key].length <= 500) clean[key] = item[key].trim();
      else if (Array.isArray(item[key]) && item[key].length <= 20 && item[key].every(value => typeof value === 'string' && value.length <= 160)) clean[key] = item[key].map(value => value.trim());
      else throw invalid(`Invalid wardrobe ${key}. Use text or a short list of text tags.`);
    }
    return clean;
  });
  if (body.anchorId && !items.some(item => item.id === body.anchorId)) throw invalid('The starting piece is no longer in your wardrobe. Choose another piece.', 'ANCHOR_NOT_FOUND');
  if (body.anchorId && items.find(item => item.id === body.anchorId).needsReview) throw invalid('Review the starting piece’s details before styling it.', 'ANCHOR_NEEDS_REVIEW');
  return {items, request:body.request.trim(), context:body.context?.trim() || '', anchorId:body.anchorId || null, requireLowUse:body.requireLowUse === true};
}

// A small complete witness prevents retrieval from losing slots, the anchor or the only usable low-use piece.
function completeWitness(ranked, anchorId, requireLowUse) {
  const anchor = ranked.find(entry => entry.item.id === anchorId)?.item;
  const lowUseOptions = requireLowUse ? ranked.filter(entry => entry.item.wears <= 1).map(entry => entry.item) : [null];
  for (const slots of [['Top','Bottom','Shoes'], ['Dress','Shoes']]) {
    for (const lowUse of lowUseOptions) {
      const required = [anchor, lowUse].filter((item, index, all) => item && all.findIndex(other => other?.id === item.id) === index);
      if (required.some(item => !slots.includes(item.category) && !['Outerwear','Accessory'].includes(item.category))) continue;
      if ([...slots, 'Outerwear'].some(category => required.filter(item => item.category === category).length > 1)) continue;
      const outfit = [...required];
      for (const category of slots) if (!outfit.some(item => item.category === category)) {
        const candidate = ranked.find(entry => entry.item.category === category)?.item;
        if (candidate) outfit.push(candidate);
      }
      if (slots.every(category => outfit.some(item => item.category === category))) return outfit;
    }
  }
  return null;
}

export function prepareWardrobeRetrieval(inputItems, options={}) {
  const start = performance.now();
  const {items, request, context, anchorId, requireLowUse} = validateStyleRequest({...options, items:inputItems});
  const eligible = items.filter(item => !item.needsReview);
  const query = queryTerms(`${context} ${request}`);
  const ranked = rankDocuments(eligible.map((item, index) => ({item, index, text:itemText(item)})), query);
  return {start,items,eligible,request,context,anchorId,requireLowUse,ranked};
}

export function lexicalCandidates(inputItems,options={}) {
  return prepareWardrobeRetrieval(inputItems,options).ranked.map((entry,index)=>({id:entry.item.id,item:entry.item,bm25Score:entry.score,lexicalScore:entry.score,lexicalRank:entry.score>0?index+1:null}));
}

export function selectWardrobeCandidates(state,ranked=state.ranked,metadata={}) {
  const {start,items,eligible,request,context,anchorId,requireLowUse}=state;
  const witness = completeWitness(ranked, anchorId, requireLowUse);
  if (!witness) {
    const hasBase = eligible.some(item => item.category === 'Dress') || (eligible.some(item => item.category === 'Top') && eligible.some(item => item.category === 'Bottom'));
    const hasShoes = eligible.some(item => item.category === 'Shoes');
    const missing = [!hasBase && 'a reviewed top and bottom, or a dress', !hasShoes && 'reviewed shoes'].filter(Boolean);
    throw invalid(missing.length ? `Add ${missing.join(' and ')} to build a complete outfit.` : requireLowUse ? `No complete outfit can include ${anchorId ? 'both the starting piece and ' : ''}a piece with one recorded wear or less. ${anchorId ? 'Change the starting piece or rediscovery request.' : 'Add an underused piece or change the rediscovery request.'}` : 'The starting piece needs matching outfit slots. Add a top and bottom for separates, or use a dress.', 'NO_COMPLETE_OUTFIT');
  }
  const selected = new Set(witness.map(item => item.id));
  const selections = new Map(witness.map(item => [item.id, 'Keeps a complete outfit available']));
  // Interleave category rankings so a popular category cannot crowd out shoes or the alternative dress route.
  const buckets = WARDROBE_CATEGORIES.map(category => ranked.filter(entry => entry.item.category === category));
  for (let index = 0; selected.size < Math.min(MAX_RETRIEVED, eligible.length); index += 1) {
    for (const bucket of buckets) {
      const entry = bucket[index];
      if (entry && selected.size < MAX_RETRIEVED && !selected.has(entry.item.id)) {
        selected.add(entry.item.id);
        selections.set(entry.item.id, `Adds ${['Outerwear', 'Accessory'].includes(entry.item.category) ? 'an' : 'a'} ${entry.item.category.toLowerCase()} option`);
      }
    }
  }
  // Preserve source order for stable aliases; scores and evidence expose why each item was selected.
  const selectedEntries = ranked.filter(entry => selected.has(entry.item.id)).sort((a, b) => a.index - b.index);
  const evidence = selectedEntries.map(entry => ({
    id:entry.item.id,
    score:Number(entry.score.toFixed(4)),
    ...(entry.evidence||{}),
    reasons:[
      ...(entry.matches.length ? [`Matches your brief: ${entry.matches.slice(0,5).join(', ')}`] : []),
      ...(entry.reasons||[]),
      ...(entry.item.id === anchorId ? ['Your selected starting piece'] : []),
      ...(requireLowUse && entry.item.wears <= 1 ? ['One recorded wear or less; eligible for rediscovery'] : []),
      selections.get(entry.item.id),
    ],
  }));
  const guideQuery = queryTerms(`${context} ${request} ${requireLowUse ? 'rediscover' : ''} ${anchorId ? 'anchor' : ''}`);
  const rankedGuides = rankDocuments(STYLE_GUIDES.slice(1).map((guide, index) => ({guide, index, text:`${guide.title} ${guide.keywords} ${guide.keywords}`})), guideQuery);
  const guidance = [STYLE_GUIDES[0], ...rankedGuides.filter(entry => entry.score > 0).slice(0,2).map(entry => entry.guide)].map(({id,title,text,source}) => ({id,title,text,...(source?{source}:{})}));
  return {
    items:selectedEntries.map(entry => entry.item),
    retrieval:{version:RETRIEVAL_VERSION, method:'BM25 + explicit synonyms + category coverage', eligibleCount:eligible.length, retrievedCount:selectedEntries.length, excludedReviewCount:items.length-eligible.length, items:evidence, guidance, anchorId, ...metadata, timingMs:Number((performance.now()-start).toFixed(2))},
  };
}

export function retrieveWardrobe(inputItems,options={}) {
  return selectWardrobeCandidates(prepareWardrobeRetrieval(inputItems,options));
}

export function itemGrounding(item, retrieval) {
  return {
    itemId:item.id,
    reasons:retrieval.items.find(entry => entry.id === item.id)?.reasons || [],
    facts:[
      `Category: ${item.category}`,
      ...(item.colorName ? [`Color label: ${item.colorName}`] : item.color ? [`Recorded color: ${item.color}`] : []),
      ...(item.pattern ? [`Pattern: ${item.pattern}`] : []),
      ...(item.fit ? [`Fit: ${item.fit}`] : []),
      ...(item.materialAppearance ? [`Material appearance (unverified): ${item.materialAppearance}`] : []),
      `Recorded wears: ${item.wears}`,
    ],
  };
}
