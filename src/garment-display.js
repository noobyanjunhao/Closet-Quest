// Presentation never replaces the recognition input or a user's original photo.
export function garmentImage(item) {
  if (item?.displayMode === 'pixel') return null;
  return item?.displayMode !== 'photo' && item?.cutoutImage ? item.cutoutImage : item?.image;
}
export function applyCutout(item, image, method) {
  if (!/^data:image\/png;base64,/.test(image)) throw new Error('The cutout must be a transparent PNG.');
  return {...item, cutoutImage:image, displayMode:'cutout', cutoutMethod:method};
}
export function originalPhoto(item) {
  return item?.originalImage || item?.image;
}
export function foregroundBounds(data,width,height) {
  let left=width,top=height,right=-1,bottom=-1,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>32){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;
  }
  if(count<width*height*.005)throw new Error('No clear foreground was found. Keep the photo or try a closer picture.');
  const pad=Math.ceil(Math.max(right-left,bottom-top)*.04);
  return [Math.max(0,left-pad),Math.max(0,top-pad),Math.min(width-1,right+pad),Math.min(height-1,bottom+pad)];
}
