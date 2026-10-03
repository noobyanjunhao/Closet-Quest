import { validShape } from './recommender.js';

export function daysSinceWear(item, now = Date.now()) {
  const date = Date.parse(item.lastWorn || (item.wears === 0 ? item.addedAt : ''));
  return Number.isFinite(date) ? Math.max(0, Math.floor((now - date) / 86400000)) : null;
}
export function closetCheck(items, now = Date.now()) {
  return items.filter(item => !item.needsReview && (daysSinceWear(item, now) ?? -1) >= 30 && !(Date.parse(item.keepUntil) > now))
    .sort((a, b) => daysSinceWear(b, now) - daysSinceWear(a, now));
}
export function favoriteProgress(state) {
  const anchorId = state.favoriteQuest?.anchorId;
  const seen = new Set();
  return (state.savedOutfits || []).filter(look => {
    const pieces = look.itemIds.map(id => state.items.find(item => item.id === id));
    if (!anchorId || !look.itemIds.includes(anchorId) || pieces.some(item => !item || item.needsReview) || new Set(look.itemIds).size !== look.itemIds.length) return false;
    const core = pieces.filter(item => item.category !== 'Accessory');
    if (!validShape(core)) return false;
    const key = core.map(item => item.id).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3);
}
export function beginFavorite(state, anchorId) {
  if (state.completed.includes('forgotten-favorite')) throw new Error('You already earned this quest reward.');
  if (!state.items.some(item => item.id === anchorId && !item.needsReview)) throw new Error('Choose a reviewed piece from your closet.');
  return { ...state, favoriteQuest: { anchorId, startedAt: new Date().toISOString() } };
}
export function claimFavorite(state) {
  if (state.completed.includes('forgotten-favorite')) throw new Error('You already earned this quest reward.');
  if (favoriteProgress(state).length < 3) throw new Error('Save three different complete outfits with your chosen piece first.');
  return { ...state, xp: state.xp + 150, completed: [...state.completed, 'forgotten-favorite'] };
}
export function matchInspiration(pieces, items) {
  const used = new Set();
  const stop = new Set(['a','an','the','and','or','with','of','in','for','on','at','to','as','from','worn','wear','style','colored']);
  const words = value => new Set((String(value || '').toLowerCase().match(/[a-z]+/g) || []).filter(word=>!stop.has(word)));
  const accessoryType = value => {
    const text=String(value||'').toLowerCase();
    return [/belt/,/sock/,/scarf/,/hat|cap|beanie/,/bag|tote|backpack|purse/,/jewel|necklace|ring|bracelet|earring/].findIndex(pattern=>pattern.test(text));
  };
  return pieces.map(piece => {
    const query = words(`${piece.description} ${piece.color}`);
    const type=accessoryType(piece.description);
    const candidates = items.filter(item => !item.needsReview && item.category === piece.category && !used.has(item.id) && (piece.category!=='Accessory' || type<0 || accessoryType(`${item.name} ${item.itemType}`)===type));
    const scored = candidates.map(item => {
      const tokens = words(`${item.name} ${item.colorName} ${item.pattern} ${item.tags}`);
      return { item, score: [...query].filter(token => tokens.has(token)).length };
    }).sort((a,b) => b.score-a.score || a.item.wears-b.item.wears);
    const best = scored[0];
    if (best) used.add(best.item.id);
    return { ...piece, item: best?.item || null, exactTerms: (best?.score || 0) > 0 };
  });
}
