// Prepare a portable copy without changing the active wardrobe. Cloud photo
// downloads are bounded as a group, so an unavailable project cannot trap export.
export async function prepareBackupExport(state,{readImage,timeoutMs=12000,concurrency=4}={}) {
  const backup=structuredClone(state),references=[];
  for(const item of backup.items)for(const field of ['image','originalImage','cutoutImage']){
    if(item[field]?.startsWith('/api/cloud/photos/'))references.push({item,field,url:item[field]});
  }
  const urls=[...new Set(references.map(r=>r.url))],resolved=new Map();
  if(urls.length){
    const controller=new AbortController();let stopped=false,next=0,timer;
    async function worker(){
      while(!stopped&&next<urls.length){
        const url=urls[next++];
        try {
          const image=await readImage(url,{preserve:true,signal:controller.signal});
          if(!stopped&&typeof image==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(image))resolved.set(url,image);
        }catch{/* Preserve the original link and every other recovered photo. */}
      }
    }
    const deadline=new Promise(resolve=>{timer=setTimeout(()=>{stopped=true;controller.abort();resolve();},timeoutMs);});
    try{await Promise.race([Promise.all(Array.from({length:Math.min(concurrency,urls.length)},worker)),deadline]);}
    finally{stopped=true;clearTimeout(timer);controller.abort();}
    for(const {item,field,url} of references)if(resolved.has(url))item[field]=resolved.get(url);
  }
  return {state:backup,recoveredPhotos:resolved.size,unavailablePhotos:urls.length-resolved.size};
}
