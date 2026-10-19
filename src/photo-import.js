import { recognitionPatch } from './wardrobe.js';

// Normalize coordinates once for both the preview and the saved crop.
export function detectionCrop(result, garment) {
  const b=garment?.boundingBox, parent=result?.pipeline?.crop||{x:0,y:0,width:1,height:1};
  if(!b||![b.x,b.y,b.width,b.height,parent.x,parent.y,parent.width,parent.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.000001||b.y+b.height>1.000001)throw new Error('This suggested crop is invalid. Retry photo analysis.');
  return {x:parent.x+b.x*parent.width,y:parent.y+b.y*parent.height,width:b.width*parent.width,height:b.height*parent.height};
}

export function detectionDrafts(source, result, selections, croppedImages, makeId=()=>crypto.randomUUID()) {
  if(!Array.isArray(result?.garments)||!selections.length||selections.length>6||new Set(selections).size!==selections.length||selections.some(i=>!Number.isInteger(i)||!result.garments[i])||croppedImages.length!==selections.length)throw new Error('Choose at least one detected piece.');
  return selections.map((index,order)=>{
    const attributes=result.garments[index], singleResult={...result,data:attributes};
    delete singleResult.garments;delete singleResult.sceneNotes;
    return {id:makeId(),photoKey:makeId(),image:croppedImages[order],sampleId:source.sampleId,
      ...recognitionPatch(singleResult),wears:0,needsReview:true,addedAt:new Date().toISOString(),
      sourcePhotoKey:source.photoKey,detectedCrop:detectionCrop(result,attributes),
      recognition:{status:'review',stage:'ready',result:singleResult,detectionMode:'single',startedAt:Date.now()},
    };
  });
}

export function insertDetectionDrafts(state, source, jobId, drafts) {
  const current=state.items.find(item=>item.id===source.id);
  if(!current||current.photoKey!==source.photoKey||current.recognition?.jobId!==jobId||current.recognition?.importedDetections)throw new Error('This photo changed or its pieces were already added. Reopen the photo to continue.');
  // Pending imports are replaced atomically. Existing reviewed pieces retain IDs,
  // saved looks and wear history, and the new detections are added alongside them.
  const replace=current.needsReview;
  const items=replace?state.items.flatMap(item=>item.id===source.id?drafts:[item]):[...state.items.map(item=>item.id===source.id?{...item,recognition:{...item.recognition,status:'reviewed',importedDetections:true}}:item),...drafts];
  return {...state,items};
}
