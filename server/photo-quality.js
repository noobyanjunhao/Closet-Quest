import sharp from 'sharp';

// Heuristic warnings, never a probability of recognition correctness. No synthetic
// sharpening: missing pixels cannot be recovered by claiming a confident garment.
export async function assessPhotoQuality(bytes,{width,height}={}) {
  const {data,info}=await sharp(bytes).resize({width:256,height:256,fit:'inside',withoutEnlargement:true}).greyscale().raw().toBuffer({resolveWithObject:true});
  let sum=0,sq=0,n=0,light=0;
  for(const v of data)light+=v;
  for(let y=1;y<info.height-1;y++)for(let x=1;x<info.width-1;x++){
    const i=y*info.width+x,v=4*data[i]-data[i-1]-data[i+1]-data[i-info.width]-data[i+info.width];sum+=v;sq+=v*v;n++;
  }
  const sharpness=n?sq/n-(sum/n)**2:0,luminance=light/data.length,flags=[];
  if(Math.min(width||info.width,height||info.height)<320)flags.push('low-resolution');
  if(luminance<45)flags.push('dark');
  if(sharpness<35)flags.push('soft-detail');
  const messages={
    'low-resolution':'This photo is small. Hats, shoes and small accessories may be missed. Try the original phone photo or a closer shot.',
    dark:'This photo looks dark. Use daylight or brighter lighting and check for missing pieces.',
    'soft-detail':'Fine detail looks soft or low-contrast. Hold the phone steady and check every visible piece; a plain garment can also trigger this hint.',
  };
  return {version:'photo-quality-v1',flags,warnings:flags.map(f=>messages[f]),metrics:{width,height,luminance:Math.round(luminance),laplacianVariance:Math.round(sharpness)},policy:'advisory-only',completeInventoryVerified:false};
}

