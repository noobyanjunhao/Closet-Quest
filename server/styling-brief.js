// Occasion intent comes from the current brief before the UI's default occasion.
export function stylingOccasion(request = '', context = '') {
  const text = `${request} ${context}`.toLowerCase();
  if (/\bwedding\b|\bblack[ -]tie\b/.test(text)) return 'Wedding';
  if (/\bformal\b|\bformlal\b|\bformall\b|\bgala\b/.test(text)) return 'Formal';
  return context || 'Your plans';
}

export function missingSlots(items) {
  const has = category => items.some(item => item.category === category);
  return [...(!has('Dress') ? [!has('Top') && 'Top', !has('Bottom') && 'Bottom'] : []),
    !has('Shoes') && 'Shoes'].filter(Boolean);
}

export function shoppingSuggestions(items, occasion) {
  const formal = ['Wedding', 'Formal'].includes(occasion);
  const missing = missingSlots(items);
  const casual = item => /\b(jeans|denim|t-?shirt|tee|hoodie|sweatshirt|sneakers?|trainers?|shorts|sweatpants)\b/i
    .test([item.name, item.itemType].join(' '));
  const upgrades = formal ? items.filter(casual).map(item => item.category) : [];
  const labels = formal
    ? {Top:'A dress shirt or dressy blouse', Bottom:'Tailored trousers or a dressy skirt', Shoes:'Dress shoes', Dress:'A dress that suits the dress code', Outerwear:'A tailored jacket'}
    : {Top:'A top you love', Bottom:'Trousers or a skirt', Shoes:'Shoes to finish the look'};
  return [...new Set([...missing, ...upgrades])].filter(category => labels[category]).map(category => ({
    category, title:labels[category], kind:missing.includes(category) ? 'missing' : 'dress-code-upgrade',
    owned:false, status:'placeholder', url:null,
    note:missing.includes(category) ? 'Not in this look. Borrow, rent, or use something you haven’t added yet.' : 'An optional swap for a dressier version of this look.',
  }));
}

export function quickStylingNote(items, occasion, suggestions) {
  const names = items.map(item => item.name || item.category);
  const start = names.length ? `I’d start with ${names.join(' + ')}.` : 'Let’s build you a starting point.';
  const formal = ['Wedding', 'Formal'].includes(occasion);
  const gap = suggestions.length ? ` To finish it, try ${suggestions.map(s => s.title.toLowerCase()).join(', ')}. Borrowing or renting works too.` : ' Keep the finishing touches simple and let these pieces do their thing.';
  const caveat = formal ? ' Check the invitation’s dress code—this is a starting point, not a promise it’s formal enough.' : '';
  return `${start}${gap}${caveat}`.slice(0, 700);
}
