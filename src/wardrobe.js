import { initialState } from './logic.js';
import { validShape } from './recommender.js';

// Keep the original synthetic seed frozen for the Sprint 3 experiments.
export const photoCollection = [
  { sampleId: 'tee', name: 'Landscape graphic tee', category: 'Top', color: '#ecece6', colorName: 'Off white', pattern: 'Landscape graphic', tags: 'Campus casual, Coffee date', wears: 8 },
  { sampleId: 'denim', name: 'Everyday blue jeans', category: 'Bottom', color: '#7694aa', colorName: 'Light blue', pattern: 'Solid', tags: 'Campus casual, Coffee date', wears: 12 },
  { sampleId: 'sneakers', name: 'White canvas sneakers', category: 'Shoes', color: '#e9e7e0', colorName: 'White', pattern: 'Solid', tags: 'Campus casual, Coffee date, Presentation day', wears: 15 },
  { sampleId: 'knit', name: 'Forest cable-knit sweater', category: 'Top', color: '#354b3c', colorName: 'Forest green', pattern: 'Cable knit', tags: 'Campus casual, Coffee date, Presentation day', wears: 1 },
  { sampleId: 'trousers', name: 'Pleated sand trousers', category: 'Bottom', color: '#cfbda0', colorName: 'Sand', pattern: 'Solid', tags: 'Campus casual, Coffee date, Presentation day', wears: 0 },
  { sampleId: 'blazer', name: 'Navy everyday blazer', category: 'Outerwear', color: '#242d40', colorName: 'Navy', pattern: 'Solid', tags: 'Coffee date, Presentation day', wears: 0 },
  { sampleId: 'tote', name: 'Sand everyday tote', category: 'Accessory', color: '#ac9b75', colorName: 'Sand', pattern: 'Solid', tags: 'Campus casual, Coffee date, Presentation day', wears: 0 },
];
export function sampleItem(sample) {
  return { ...sample, id: `photo-${sample.sampleId}`, photoKey: `sample-${sample.sampleId}`, image: `photos/${sample.sampleId}.jpg`, addedAt: '2026-09-21T00:00:00.000Z' };
}
export function newPhotoState() {
  return { ...initialState(), wardrobeId:crypto.randomUUID(), schemaVersion: 2, items: photoCollection.map(sampleItem), savedOutfits: [], wearRecords: [] };
}
export function migrateState(value) {
  if (!value || !Array.isArray(value.items) || !Array.isArray(value.completed) || !Array.isArray(value.submissions) || !Number.isFinite(value.xp) || typeof value.profile !== 'string') throw new Error('This closet could not be read.');
  return { ...value, wardrobeId:value.wardrobeId||crypto.randomUUID(), schemaVersion: 2, savedOutfits: value.savedOutfits || [], wearRecords: value.wearRecords || [] };
}
export function addPhotoCollection(state) {
  const existing = new Set(state.items.map(i => i.sampleId));
  const ids = new Set(state.items.map(i => i.id));
  const added = photoCollection.filter(s => !existing.has(s.sampleId)).map(s => {
    const item = sampleItem(s);
    if (ids.has(item.id)) item.id = crypto.randomUUID();
    return item;
  });
  return { ...state, items: [...state.items, ...added] };
}
export function saveLook(state, itemIds, { title, context, explanation, engine, pipeline, model }) {
  const items = itemIds.map(id => state.items.find(i => i.id === id));
  if (items.some(i => !i || i.needsReview) || new Set(itemIds).size !== itemIds.length || !validShape(items.filter(i => i.category !== 'Accessory'))) throw new Error('Save a complete outfit from your reviewed closet.');
  const key = [...itemIds].sort().join('|');
  if (state.savedOutfits.some(o => [...o.itemIds].sort().join('|') === key && o.context === context)) throw new Error('This combination is already in your lookbook.');
  return { ...state, savedOutfits: [...state.savedOutfits, { id: crypto.randomUUID(), itemIds: [...itemIds], title: title?.trim().slice(0,80) || `${context} look`, context, explanation, engine, runId:pipeline?.runId, model, createdAt: new Date().toISOString() }] };
}
export function recordWear(state, itemIds, { id = crypto.randomUUID(), at = new Date().toISOString(), outfitId = null, runId = null } = {}) {
  if (state.wearRecords.some(r => r.id === id)) return state;
  const ids = [...new Set(itemIds)];
  if (!ids.length || ids.some(id => !state.items.some(i => i.id === id))) throw new Error('Choose garments that are still in your closet.');
  const record = { id, itemIds: ids, wornAt: at, outfitId, runId, previousLastWorn: Object.fromEntries(state.items.filter(i => ids.includes(i.id)).map(i => [i.id, i.lastWorn || null])) };
  return { ...state, items: state.items.map(i => ids.includes(i.id) ? { ...i, wears: i.wears + 1, lastWorn: at } : i), wearRecords: [...state.wearRecords, record], ...(runId?{recommendationHistory:(state.recommendationHistory||[]).map(run=>run.runId===runId?{...run,wornAt:at,chosenItemIds:ids}:run)}:{}) };
}
export function undoLastWear(state) {
  const record = state.wearRecords.at(-1);
  if (!record) return state;
  const wearRecords=state.wearRecords.slice(0,-1);
  return { ...state, items: state.items.map(i => record.itemIds.includes(i.id) ? { ...i, wears: Math.max(0, i.wears - 1), lastWorn: record.previousLastWorn[i.id] || undefined } : i), wearRecords, ...(record.runId?{recommendationHistory:(state.recommendationHistory||[]).map(run=>run.runId===record.runId?{...run,wornAt:wearRecords.findLast(wear=>wear.runId===run.runId)?.wornAt}:run)}:{}) };
}
const dayKey = date => { const d=new Date(date);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
const combinationKey = ids => JSON.stringify([...new Set(ids)].sort());
export function wornToday(state, itemIds, at=new Date().toISOString()) {
  return state.wearRecords.some(record=>dayKey(record.wornAt)===dayKey(at)&&combinationKey(record.itemIds)===combinationKey(itemIds));
}
export function recordWearToday(state,itemIds,{at=new Date().toISOString(),outfitId=null,runId=null}={}) {
  if(wornToday(state,itemIds,at))return state;
  return recordWear(state,itemIds,{at,outfitId,runId,id:`today-${dayKey(at)}-${combinationKey(itemIds)}`});
}
export function deleteGarment(state, id) {
  return { ...state, items: state.items.filter(i => i.id !== id), savedOutfits: state.savedOutfits.filter(o => !o.itemIds.includes(id)), wearRecords: state.wearRecords.map(r => {
    const previousLastWorn = { ...r.previousLastWorn }; delete previousLastWorn[id];
    return { ...r, itemIds: r.itemIds.filter(i => i !== id), previousLastWorn };
  }).filter(r => r.itemIds.length), submissions: state.submissions.map(s => ({ ...s, itemIds: s.itemIds.filter(i => i !== id) })) };
}
export function recognitionPatch(result) {
  const a = result.data;
  // Label text is manual-only. Applying AI suggestions must not erase a user's label entry.
  return { ...Object.fromEntries(['name','category','color','colorName','pattern','fit','materialAppearance','uncertainty','itemType','targetDescription','colorSource','labelPolicy'].filter(k=>a[k]!==undefined).map(k => [k,a[k]])), tags: [...a.occasions, ...a.styleTags].join(', ').slice(0,500) };
}
