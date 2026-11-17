// Match saveLook's duplicate identity so the UI can show a persistent success state.
export function findSavedLook(savedOutfits,itemIds,occasion){
  if(!Array.isArray(savedOutfits)||!Array.isArray(itemIds)||!itemIds.length)return null;
  const key=JSON.stringify([...itemIds].sort());
  return savedOutfits.find(look=>look?.context===occasion&&Array.isArray(look.itemIds)&&JSON.stringify([...look.itemIds].sort())===key)||null;
}
