// Only these public product terms leave the brief when searching a store.
const categories = {
  Shoes: /\b(?:shoes?|footwear|sneakers?|trainers?|loafers?|boots?|sandals?|heels?|flats?|oxfords?|espadrilles?|pumps?|slippers?|mules?|derbies|brogues?)\b/i,
  Outerwear: /\b(?:jacket|coat|blazer|parka|overshirt)s?\b/i,
  Bottom: /\b(?:jeans|pants|trousers|shorts|skirts?|chinos|leggings)\b/i,
  Dress: /\b(?:dress(?:es)?(?!\s+(?:shoes?|shirts?|pants))|gowns?)\b/i,
  Accessory: /\b(?:accessor(?:y|ies)|bags?|belts?|scarves|hats?|totes?|caps?|ties?)\b/i,
  Top: /\b(?:tops?|shirts?|tees?|sweaters?|knits?|hoodies?|blouses?|cardigans?)\b/i,
};
const types = {
  sneakers: /\b(?:sneakers?|trainers?)\b/i, loafers: /\bloafers?\b/i,
  boots: /\bboots?\b/i, sandals: /\bsandals?\b/i, heels: /\b(?:heels?|pumps?)\b/i,
  flats: /\b(?:flats?|ballet flats?)\b/i, jeans: /\b(?:jeans|denim pants)\b/i,
  jacket: /\bjackets?\b/i, blazer: /\bblazers?\b/i, sweater: /\b(?:sweaters?|knitwear)\b/i,
  bag: /\b(?:bags?|totes?)\b/i, shirt: /\bshirts?\b/i,
};
const typeCategory = {sneakers:'Shoes',loafers:'Shoes',boots:'Shoes',sandals:'Shoes',heels:'Shoes',flats:'Shoes',jeans:'Bottom',jacket:'Outerwear',blazer:'Outerwear',sweater:'Top',bag:'Accessory',shirt:'Top'};
const colors = ['black','white','brown','navy','blue','red','green','pink','cream','gray','beige'];
export function validShopFilters(category,kind,color) {
  return (kind==null || typeof kind==='string' && Object.hasOwn(typeCategory,kind) && typeCategory[kind] === category) && (color==null || colors.includes(color));
}
// Retailer titles rarely repeat the shopper's exact word ("ecru cardigan" is a cream sweater),
// so product matching accepts common trade synonyms. Parsing a brief still uses the stricter lists above.
const productTypes = {
  sneakers: /\b(?:sneakers?|trainers?|runners?|tennis shoes?|court shoes?)\b/i, loafers: /\b(?:loafers?|moccasins?|penny)\b/i,
  boots: /\b(?:boots?|booties?|chelseas?)\b/i, sandals: /\b(?:sandals?|slides?|flip[- ]flops?)\b/i, heels: /\b(?:heels?|pumps?|stilettos?|slingbacks?)\b/i,
  flats: /\b(?:flats?|ballerinas?|mary janes?)\b/i, jeans: /\b(?:jeans?|denim)\b/i,
  jacket: /\b(?:jackets?|bombers?|truckers?|anoraks?|parkas?|overshirts?|shackets?|windbreakers?)\b/i, blazer: /\b(?:blazers?|sport ?coats?|suit jackets?)\b/i,
  sweater: /\b(?:sweaters?|knitwear|knits?|cardigans?|pullovers?|crewnecks?|turtlenecks?|jumpers?)\b/i,
  bag: /\b(?:bags?|totes?|backpacks?|crossbod(?:y|ies)|satchels?|purses?)\b/i, shirt: /\b(?:shirts?|oxfords?|button[- ](?:down|up)s?|tees?|polos?)\b/i,
};
const productColors = {
  black: /\b(?:black|onyx|jet)\b/, white: /\b(?:white|optic)\b/, cream: /\b(?:cream|ivory|ecru|off[- ]white|oatmeal|natural|bone|eggshell)\b/,
  gray: /\b(?:gray|charcoal|heather|slate|graphite|silver)\b/, beige: /\b(?:beige|tan|khaki|camel|sand|stone|taupe)\b/,
  navy: /\b(?:navy|midnight)\b/, blue: /\b(?:blue|indigo|denim|cobalt|sky|azure|(?:light|medium|dark) wash)\b/,
  brown: /\b(?:brown|chocolate|espresso|cognac|tobacco|chestnut|walnut|mocha)\b/, green: /\b(?:green|olive|sage|forest|emerald|moss)\b/,
  red: /\b(?:red|burgundy|maroon|crimson|wine|scarlet)\b/, pink: /\b(?:pink|rose|blush|fuchsia|mauve)\b/,
};
export function matchesShopProduct(product, query) {
  const title = product.title || '', plain = title.toLowerCase().replace(/\bgrey\b/g,'gray');
  if (query.category === 'Shoes' && (!(categories.Shoes.test(title) || Object.keys(productTypes).some(t=>typeCategory[t]==='Shoes'&&productTypes[t].test(title))) || /\b(?:shoe (?:bags?|racks?|trees?|polish)|boot socks?|shoelaces?|insoles?)\b/i.test(title))) return false;
  if (query.kind && !(types[query.kind]?.test(title) || productTypes[query.kind]?.test(title))) return false;
  return !query.color || productColors[query.color]?.test(plain) || plain.split(/[^a-z]+/).includes(query.color);
}
export function parseShopBrief(brief = '') {
  const text = brief.toLowerCase().replace(/[’']/g,"'").replace(/\bgrey\b/g,'gray');
  if (/\b(?:no shopping|no new (?:clothes|pieces)|(?:my )?closet only|only (?:use |wear )?(?:my|what i own)|(?:don't|do not) (?:shop|buy|recommend anything new))\b/.test(text)) return null;
  const actions = [...text.matchAll(/\b(?:shop(?:ping)?(?: for)?|buy|purchase|where (?:can|could|should) i (?:get|find)|find(?: me)?|recommend(?: me)?|suggest(?: me)?|show me|look(?:ing)? for|i (?:need|want))\b/gi)];
  const action = actions.findLast(match=>Object.values(categories).some(pattern=>pattern.test(text.slice(match.index + match[0].length)))) || actions.at(-1);
  const external = /\b(?:online|external|stores?|retailers?|for sale|to buy|new (?:clothes|clothing|pieces?|shoes|outfit))\b/.test(text);
  const outfit = /\b(?:outfit|look(?! for)|style (?:my|me|an?)|pair my|dress me|what (?:can|should) i wear|what to wear|put together|from my closet)\b/.test(text);
  const forExistingLook = /\b(?:for|with|match|finish|complete|go with)\s+(?:my|this|the|that)\s+(?:look|outfit)\b/.test(text);
  const tail = action ? text.slice(action.index + action[0].length).trim() : text;
  const shoppingClause=(tail||text).split(/\s+(?:(?:to (?:go|wear)|to pair|to match|with|for) (?:with )?(?:my|this|that)|and (?:style|build|create|plan|put together))\b/)[0];
  const target = Object.values(categories).some(pattern=>pattern.test(shoppingClause)) ? shoppingClause : text;
  const category = Object.keys(categories).filter(c=>categories[c].test(target)).sort((a,b)=>target.search(categories[a])-target.search(categories[b]))[0];
  const asksToShop = external || /\b(?:buy|shop|purchase)\b/.test(text) || !!action && !outfit && /\b(?:clothes|clothing|apparel)\b/.test(shoppingClause);
  if (!asksToShop && /\b(?:wear|use|include|pair|style)\s+(?:my|these|this)\b/.test(target) && !/\b(?:and|also|plus)\s+(?:find|recommend|suggest|show)/.test(text)) return null;
  if (!asksToShop && !action && /\bmy\b/.test(text)) return null;
  const productQuery = category && (text.trim().split(/\s+/).length<=4 || /\$\d/.test(text)) && !/\b(?:wear|style|outfit|my)\b/.test(text);
  if ((!action && !asksToShop && !productQuery) || (!category && !asksToShop) || (outfit && !forExistingLook && !asksToShop && !/\b(?:and|also|plus)\s+(?:find|recommend|suggest|show|style|build|create)/.test(text))) return null;
  if (!asksToShop && /^(?:me )?my\b|\b(?:from my closet|i own|i already have)\b/.test(target)) return null;
  const kind = Object.keys(types).find(t=>typeCategory[t] === category && types[t].test(target));
  const color = colors.find(c=>new RegExp('\\b'+c+'\\b').test(target));
  const amount = text.match(/(?:under|below|up to|at most|less than|budget(?: of)?|maximum)\s*\$?\s*(\d+(?:\.\d{1,2})?)/)?.[1] || text.match(/\$(\d+(?:\.\d{1,2})?)\s*(?:or less|max|budget)/)?.[1];
  const maxPrice = Number(amount) || null;
  const presentation = /\b(?:women(?:'s|s|swear)?|female)\b/.test(text) ? 'womenswear' : /\b(?:men(?:'s|s|swear)?|male)\b/.test(text) ? 'menswear' : 'any';
  const mode = outfit && !forExistingLook && !/\b(?:buy|shop for) (?:me )?(?:a |an )?(?:new )?outfit\b/.test(text) ? 'mixed' : 'shop';
  return {mode, category:category || 'All', kind, color, maxPrice, presentation,
    occasion:/\b(?:wedding|formal|black tie|gala|dress shoes)\b/.test(text)?'formal':'everyday'};
}
export function retailerSearch(query) {
  const labels={Top:'tops',Bottom:'pants',Shoes:'shoes',Outerwear:'jackets',Dress:'dresses',Accessory:'accessories',All:'clothing'};
  const term=[query.presentation==='menswear'?'mens':query.presentation==='womenswear'?'womens':'',query.occasion==='formal'?'dressy':'',query.color,query.kind || labels[query.category]].filter(Boolean).join(' ');
  return 'https://www.nordstrom.com/sr?'+new URLSearchParams({keyword:term});
}
