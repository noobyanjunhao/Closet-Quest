export async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP photo under 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); }
    catch { throw new Error('This photo could not be read. Choose a different JPG, PNG or WebP, or add the piece without a photo.'); }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg', .82);
  } finally { URL.revokeObjectURL(url); }
}
export async function imageData(image) {
  if (image.startsWith('data:')) return image;
  const response = await fetch(image);
  if (!response.ok) throw new Error('The photo could not be loaded.');
  return preparePhoto(new File([await response.blob()], 'garment.jpg', { type:'image/jpeg' }));
}
export async function api(path, body, method = 'POST', {signal,timeoutMs=190000} = {}) {
  let response;
  try { response = await fetch(`/api/${path}`, { method, ...(body ? { headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) }); }
  catch { if(signal?.aborted)throw Object.assign(new Error('Styling cancelled.'),{code:'CANCELLED'});throw Object.assign(new Error(path.startsWith('jobs/')?'Connection interrupted. Your photo is saved; checking analysis again shortly.':'Connection interrupted. Check the local service and try again.'),{retryable:true}); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'The local service could not finish this request.'),{status:response.status,code:data.code,retryable:data.retryable===true});
  return data;
}
export function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], { type:'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
