// Reapply a server receipt safely after a lost response or browser restart.
export function applyPurchaseCommit(state,result){
 if(!result||!Array.isArray(result.garments)||result.garments.length>50||!result.garments.length||result.garments.some(g=>!g.id||g.purchaseImport?.id!==result.importId))throw Error('Invalid purchase commit receipt.');
 if(state.appliedPurchaseImports?.includes(result.importId))return state;
 const existing=new Set(state.items.map(g=>g.id));const additions=result.garments.filter(g=>!existing.has(g.id));
 if(state.items.length+additions.length>300)throw Error('Your closet has reached its 300-piece limit. Remove some pieces, then apply this saved import.');
 return {...state,items:[...additions,...state.items],appliedPurchaseImports:[...(state.appliedPurchaseImports||[]),result.importId]};
}
