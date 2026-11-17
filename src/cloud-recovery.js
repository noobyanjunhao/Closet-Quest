import {migrateState} from './wardrobe.js';

export const pendingClosetKey = accountId => `cq-cloud-pending-${accountId}`;

// Only inspect the authenticated owner's slot. Never scan other users' browser data.
export function inspectPendingCloset(storage,accountId) {
  let raw;
  try { raw=storage.getItem(pendingClosetKey(accountId)); }
  catch { throw Error('Browser storage is unavailable. Keep this page open and allow site storage before reopening your closet.'); }
  if(!raw)return {pending:null,backup:null,error:null};
  let value;
  try {
    value=JSON.parse(raw);
    if(!Number.isSafeInteger(value?.revision)||value.revision<0)throw Error();
    const state=migrateState(value.state);
    if(state.wardrobeId!==accountId)throw Error();
    return {pending:{state,revision:value.revision},backup:state,error:null};
  } catch {
    return {pending:null,backup:value??raw,error:'This device has a saved copy that could not be opened safely. Export it before contacting support. It has not been overwritten.'};
  }
}

export function openCloudVersion(storage,accountId,remote,{exported=false}={}) {
  if(!exported)throw Error('Export this device’s changes before opening the cloud version.');
  // Validate before removing anything. Reuse the snapshot we already fetched:
  // a second fetch could fail after deleting the only remaining local copy.
  if(!Number.isSafeInteger(remote?.revision)||remote.revision<0)throw Error('The cloud version could not be read. Your local changes are still on this device.');
  const state=migrateState(remote.state);
  if(state.wardrobeId!==accountId)throw Error('This cloud version does not belong to the signed-in account.');
  storage.removeItem(pendingClosetKey(accountId));
  return {state,revision:remote.revision,resume:false};
}
