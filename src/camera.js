export function createCameraSession(mediaDevices) {
  let stream, generation = 0;
  function stop() { generation++; stream?.getTracks().forEach(track => track.stop()); stream = null; }
  async function start() {
    stop();
    const current = generation;
    if (!mediaDevices?.getUserMedia) throw new Error('Camera preview is unavailable here. Use your device camera or choose a photo below.');
    const next = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } } });
    if (current !== generation) { next.getTracks().forEach(track => track.stop()); return null; }
    stream = next; return stream;
  }
  return { start, stop };
}

export function cameraMessage(error) {
  return ({ NotAllowedError: 'Camera access was declined. Allow it in your browser settings, or choose a photo.', NotFoundError: 'No camera found. Choose an existing photo instead.', NotReadableError: 'Your camera is in use. Close the other camera app, or choose a photo.' })[error.name] || error.message || 'The camera could not start. Choose a photo instead.';
}

export function prefillReview(editor, stored, patch) {
  const fields = ['name', 'category', 'color', 'colorName', 'tags', 'pattern', 'fit', 'materialAppearance', 'visibleLabelText', 'image'];
  if (!editor || editor.id !== stored?.id || !stored?.needsReview || stored.recognition?.status !== 'review' || editor.appliedSuggestions || editor.photoKey !== stored.photoKey || fields.some(key => editor[key] !== stored[key])) return editor;
  return { ...editor, ...patch, recognition: stored.recognition, appliedSuggestions: true };
}
