import { newPhotoState } from './wardrobe.js';

export function alphaDemoState() {
  const state = newPhotoState();
  return {...state, profile:'Sprint 6 rehearsal', learningEnabled:false,
    items:state.items.filter(item=>item.sampleId!=='tee')};
}
