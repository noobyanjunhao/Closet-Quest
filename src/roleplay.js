import { newPhotoState } from './wardrobe.js';
// A separate, clearly marked wardrobe. Never overwrites the user's normal closet.
export function roleplayState(now=Date.now()) {
  const state=newPhotoState();
  return {...state,profile:'Alex · role-play',learningEnabled:false,items:state.items.map(item=>({...item,wears:Math.max(1,item.wears),addedAt:new Date(now-120*86400000).toISOString(),lastWorn:new Date(now-(item.sampleId==='blazer'?43:item.sampleId==='sneakers'?96:7)*86400000).toISOString()}))};
}
