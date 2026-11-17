import footwear from '../data/footwear-picks.json';
import picks from '../data/retailer-picks.json';
import library from '../data/shopping-library.json';
import {matchesShopProduct} from './shop-brief.js';

// Older references can still link to a specific product. A stale observed
// price must never be used to claim that a product fits today's budget.
const references = [
  ...footwear.products.map(p=>({...p,category:'Shoes'})),
  ...picks,
  ...library.entries.flatMap(entry=>entry.products.map(p=>({...p,...entry.query}))),
];
export function productReferences(query) {
  if (query.maxPrice !== null) return [];
  const unique = new Map();
  for (const p of references) {
    if (query.category !== 'All' && p.category !== query.category) continue;
    if (query.presentation !== 'any' && p.presentation !== 'any' && p.presentation !== query.presentation) continue;
    if (query.occasion === 'formal' && p.occasion === 'everyday') continue;
    if (!matchesShopProduct(p,query) || unique.has(p.url)) continue;
    unique.set(p.url,{...p,price:null,retailer:new URL(p.url).hostname.replace(/^www\./,'')});
  }
  return [...unique.values()].slice(0,4);
}
