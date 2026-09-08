export const categories = ['Top', 'Bottom', 'Shoes', 'Outerwear', 'Dress', 'Accessory'];
export const contexts = ['Campus casual', 'Coffee date', 'Presentation day'];
export const quests = [
  { id: 'rediscover', title: 'The hidden gem', subtitle: 'Style a piece you’ve worn once or less.', xp: 50, context: 'Campus casual' },
  { id: 'coffee', title: 'Coffee, then compliments', subtitle: 'Put together your next coffee-date look.', xp: 40, context: 'Coffee date' },
  { id: 'presentation', title: 'Main character energy', subtitle: 'Build a look for presentation day.', xp: 60, context: 'Presentation day' },
];
export function initialState() {
  return { profile: '', xp: 0, completed: [], submissions: [], items: [
    { id: '1', name: 'Everyday cotton tee', category: 'Top', color: '#ece6d9', tags: 'Campus casual, Coffee date', wears: 8 },
    { id: '2', name: 'Straight-leg denim', category: 'Bottom', color: '#6f8b9e', tags: 'Campus casual, Coffee date', wears: 12 },
    { id: '3', name: 'Classic sneakers', category: 'Shoes', color: '#e9e5dd', tags: 'Campus casual, Coffee date, Presentation day', wears: 15 },
    { id: '4', name: 'Forest knit sweater', category: 'Top', color: '#59705a', tags: 'Coffee date, Presentation day', wears: 1 },
    { id: '5', name: 'Relaxed linen trousers', category: 'Bottom', color: '#b8a48b', tags: 'Coffee date, Presentation day', wears: 0 },
    { id: '6', name: 'Chocolate blazer', category: 'Outerwear', color: '#785745', tags: 'Presentation day', wears: 0 },
  ] };
}
export function recommend(items, context, variation = 0) {
  const pick = category => {
    const pool = items.filter(i => i.category === category).sort((a,b) =>
      Number(b.wears <= 1) - Number(a.wears <= 1) || Number(b.tags.includes(context)) - Number(a.tags.includes(context)) || a.wears - b.wears || a.id.localeCompare(b.id));
    return pool.length ? pool[variation % pool.length] : null;
  };
  const top = pick('Top'), bottom = pick('Bottom'), dress = pick('Dress'), shoes = pick('Shoes');
  if ((!top || !bottom) && !dress || !shoes) return [];
  return [...(top && bottom ? [top, bottom] : [dress]), shoes, ...(context === 'Presentation day' && pick('Outerwear') ? [pick('Outerwear')] : [])];
}
export function completeQuest(state, quest, outfit, context) {
  if (state.completed.includes(quest.id)) throw new Error('You already completed this quest. Try another one!');
  if (context !== quest.context || !outfit.length || !outfit.every(i => state.items.some(owned => owned.id === i.id))) throw new Error('Generate an outfit for this quest first.');
  if (quest.id === 'rediscover' && !outfit.some(i => state.items.find(o => o.id === i.id).wears <= 1)) throw new Error('Include an item worn once or less. Try another outfit.');
  return { ...state, xp: state.xp + quest.xp, completed: [...state.completed, quest.id], submissions: [...state.submissions, { questId: quest.id, itemIds: outfit.map(i => i.id), submittedAt: new Date().toISOString() }] };
}
export function markWorn(state, ids) {
  return { ...state, items: state.items.map(i => ids.includes(i.id) ? { ...i, wears: i.wears + 1, lastWorn: new Date().toISOString() } : i) };
}
export function listing(item) {
  return `${item.name}\n\nCategory: ${item.category}\nColor: ${item.color}\nStyle tags: ${item.tags || 'Not specified'}\nRecorded wears in Closet Quest: ${item.wears}\n\nGiving this piece a new home. Please add the brand, size, fabric, measurements, condition, any flaws, asking price, and shipping details before publishing.\n\nThis is an editable draft. Recorded wears do not establish condition or total lifetime use.`;
}
