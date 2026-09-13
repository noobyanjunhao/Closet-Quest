// Sprint 3: context is a constraint; low use is a quest constraint, not a style proxy.
export const STYLE_CONTEXTS = ['Campus casual', 'Coffee date', 'Presentation day'];
export function contextTags(item) {
  return String(item.tags ?? '').split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean);
}
export function matchesContext(item, context) {
  return contextTags(item).includes(context.trim().toLowerCase());
}
export function validShape(items) {
  const count = category => items.filter(i => i.category === category).length;
  return count('Shoes') === 1 && ((count('Top') === 1 && count('Bottom') === 1 && count('Dress') === 0) || (count('Dress') === 1 && count('Top') === 0 && count('Bottom') === 0)) && count('Outerwear') <= 1 && items.every(i => ['Top','Bottom','Dress','Shoes','Outerwear'].includes(i.category));
}
export function rankOutfits(items, context, { limit = 3, requireLowUse = false } = {}) {
  if (!STYLE_CONTEXTS.includes(context)) return { outfits: [], reason: 'Choose a supported styling context.', examined: 0 };
  if (items.length > 200) return { outfits: [], reason: 'This prototype supports up to 200 garments. Filter or reduce the closet first.', examined: 0 };
  const seen = new Set();
  const usable = items.filter(i => {
    if (!i || typeof i.id !== 'string' || seen.has(i.id) || !Number.isFinite(i.wears) || i.wears < 0) return false;
    seen.add(i.id); return matchesContext(i, context);
  });
  const pool = category => usable.filter(i => i.category === category).sort((a,b) => a.id.localeCompare(b.id));
  const tops = pool('Top'), bottoms = pool('Bottom'), dresses = pool('Dress'), shoes = pool('Shoes');
  const outerwear = context === 'Presentation day' ? pool('Outerwear') : [];
  // Outerwear is optional, but alternatives remain searchable (including for quests).
  const layers = [null, ...outerwear];
  const top = [], k = Math.max(1, Math.min(3, Math.floor(limit) || 3));
  let examined = 0;
  const consider = core => {
    for (const layer of layers) {
      const outfit = layer ? [...core, layer] : core;
      examined++;
      if (requireLowUse && !outfit.some(i => i.wears <= 1)) continue;
      // Simple interpretable tie-breaker; this is not learned taste or compatibility.
      const score = outfit.reduce((sum,i) => sum + 1 / (1 + i.wears), 0) / outfit.length;
      const key = outfit.map(i => i.id).sort().join('|');
      const candidate = { items: outfit, score, key, explanation: `Every piece is tagged for ${context.toLowerCase()}. ${outfit.filter(i => i.wears <= 1).length} piece(s) have one wear or less.` };
      top.push(candidate); top.sort((a,b) => b.score - a.score || a.key.localeCompare(b.key));
      if (top.length > k) top.pop();
    }
  };
  for (const shoe of shoes) {
    for (const upper of tops) for (const lower of bottoms) consider([upper,lower,shoe]);
    for (const dress of dresses) consider([dress,shoe]);
  }
  const reason = top.length ? '' : !shoes.length ? `Add shoes tagged for ${context.toLowerCase()}, or edit their style tags.` : !dresses.length && (!tops.length || !bottoms.length) ? `Add a top and bottom (or a dress) tagged for ${context.toLowerCase()}.` : 'No outfit includes a piece worn once or less in this context. Try another quest or add a less-worn garment.';
  return { outfits: top, reason, examined };
}
