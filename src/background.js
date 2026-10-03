// Conservative edge-connected color removal for plain backdrops. No subject/AI mask is claimed.
export function removePlainBackdrop(data, width, height, tolerance=28) {
  const result = new Uint8ClampedArray(data), visited = new Uint8Array(width*height), queue = new Int32Array(width*height);
  const corners = [0,width-1,(height-1)*width,width*height-1].map(p=>[data[p*4],data[p*4+1],data[p*4+2]]);
  const background = p => corners.some(c => Math.hypot(data[p*4]-c[0],data[p*4+1]-c[1],data[p*4+2]-c[2]) <= tolerance);
  let head=0,tail=0;
  const add=p=>{if(p<0||p>=width*height||visited[p])return;visited[p]=1;if(background(p))queue[tail++]=p;};
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
  for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
  while(head<tail){const p=queue[head++];result[p*4+3]=0;if(p%width)add(p-1);if(p%width<width-1)add(p+1);add(p-width);add(p+width);}
  if(tail/(width*height)>.85 || tail/(width*height)<.02) throw new Error('This background is too similar to the garment or too complex. Keep the original photo.');
  return result;
}
export async function cleanBackdrop(source) {
  const photo=new Image();photo.src=source;await photo.decode();
  const canvas=document.createElement('canvas'), scale=Math.min(1,700/Math.max(photo.width,photo.height));
  canvas.width=Math.round(photo.width*scale);canvas.height=Math.round(photo.height*scale);
  const ctx=canvas.getContext('2d');ctx.drawImage(photo,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  pixels.data.set(removePlainBackdrop(pixels.data,canvas.width,canvas.height));ctx.putImageData(pixels,0,0);
  return canvas.toDataURL('image/png');
}
