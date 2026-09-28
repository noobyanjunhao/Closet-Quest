import React, { useEffect, useRef, useState } from 'react';
import { createCameraSession, cameraMessage } from './camera.js';

export default function CameraCapture({ onUse, onChoose }) {
  const video = useRef(null), session = useRef(null), mounted = useRef(false);
  const [photo, setPhoto] = useState(null), [error, setError] = useState(''), [ready, setReady] = useState(false), [starting, setStarting] = useState(true);
  async function start() {
    const currentSession = session.current;
    let timer;
    setStarting(true); setError(''); setReady(false); setPhoto(null);
    try {
      const stream = await Promise.race([currentSession.start(), new Promise((_,reject)=>{timer=setTimeout(()=>{currentSession.stop();reject(new Error('The camera did not start. Check browser permissions, or choose a photo below.'));},12000);})]);
      if (stream && mounted.current && session.current === currentSession && video.current) { video.current.srcObject = stream; await video.current.play(); }
    } catch (failure) { if (mounted.current && session.current === currentSession) { currentSession.stop(); setError(cameraMessage(failure)); } }
    finally { clearTimeout(timer);if (mounted.current && session.current === currentSession) setStarting(false); }
  }
  useEffect(() => {
    mounted.current = true; session.current = createCameraSession(navigator.mediaDevices); void start();
    return () => { mounted.current = false; session.current.stop(); };
  }, []);
  async function capture() {
    const source = video.current;
    if (!source?.videoWidth || !source.videoHeight) return;
    const canvas = document.createElement('canvas'), scale = Math.min(1, 1000 / Math.max(source.videoWidth, source.videoHeight));
    canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
    if (!mounted.current || !blob) return;
    session.current.stop(); setReady(false);
    setPhoto({ preview: canvas.toDataURL('image/jpeg', .82), file: new File([blob], 'My garment.jpg', { type: 'image/jpeg' }) });
  }
  return <div className="camera-flow">
    <p>One piece at a time. Keep the whole garment in frame with even lighting.</p>
    <div className="camera-view"><video ref={video} muted playsInline hidden={Boolean(photo)} onLoadedData={() => setReady(true)} aria-label="Live garment camera preview"/>{photo ? <img src={photo.preview} alt="Your captured garment"/> : !error && <div className="camera-frame" aria-hidden="true"/>}
      {!photo && !ready && <span className="camera-placeholder">{error ? 'Choose a photo to continue' : 'Opening camera…'}</span>}
    </div>
    {error && <p role="status" className="camera-error">{error}</p>}
    <div className="camera-actions">{photo ? <><button className="primary" onClick={() => onUse(photo.file)}>Use this photo →</button><button onClick={start}>Retake</button></> : <button className="primary" disabled={!ready || starting} onClick={capture}>Take photo</button>}</div>
    <div className="camera-alternatives"><button className="text-button" onClick={onChoose}>Choose from photos</button><label className="text-button native-camera">Use device camera<input type="file" accept="image/*" capture="environment" onChange={event => { const file = event.target.files?.[0]; if (file) onUse(file); }}/></label></div>
    <p className="muted">The preview stays on your device. Closing this window stops the camera.</p>
  </div>;
}
