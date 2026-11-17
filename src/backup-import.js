import {migrateState} from './wardrobe.js';

export function prepareBackupImport(value,{currentWardrobeId,account}={}){
  const imported=migrateState(value);
  if(imported.items.length>300||imported.items.some(item=>!item||typeof item.id!=='string'||typeof item.name!=='string')||!Array.isArray(imported.savedOutfits)||!Array.isArray(imported.wearRecords))throw Error('This wardrobe backup is not valid.');
  const owned=new Set(imported.items.map(item=>item.id));
  if(owned.size!==imported.items.length||imported.savedOutfits.some(look=>!look||!Array.isArray(look.itemIds)||!look.itemIds.length||look.itemIds.some(id=>!owned.has(id)))||imported.wearRecords.some(record=>!record||!Array.isArray(record.itemIds)))throw Error('This wardrobe backup contains incomplete saved looks or wear records.');
  // A backup never changes the active account or local retrieval namespace.
  const wardrobeId=account?.cloud?account.id:currentWardrobeId||crypto.randomUUID();
  return {...imported,wardrobeId,onboardingComplete:true,learningEnabled:false};
}
