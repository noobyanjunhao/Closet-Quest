// Pixel Passport: a public, account-free campus activity.
// This module tree must not import the wardrobe app or write to browser storage.
// Its only network call is the consented photo step in likeness.js; everything
// else a visitor makes stays in page memory.
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { eventConfig } from './event-config.js';
import { manifest } from './manifest.js';
import { createInitialState, reducer, isOnePiece, prefersReducedMotion, resolveScene, createDefaultSpec, NICKNAME_MAX } from './state.js';
import { SPRITE_W, SPRITE_H } from './render-avatar.js';
import { drawCard, drawScene, drawAvatar, CARD_W, CARD_H, TAGLINE } from './render-card.js';
import { SCENE_W, SCENE_H } from './scenes.js';
import { createPhotoStore, createEventCamera, eventCameraMessage, PHOTO_ACCEPT } from './capture.js';
import { mapPointToSource } from './palette.js';
import { likenessAvailable, requestCharacter } from './likeness.js';
import { renderCardBlob, createExportStore, cardFile, canShareFile, shareCard, requestDownload } from './export-card.js';
import './pixel-passport.css';

const REVEAL_FRAMES = 16, FRAME_MS = 125;
const PRESET_SPECS = manifest.presets.map(preset => ({ preset, spec: createDefaultSpec({ presetId: preset.id }) }));

function useSystemReducedMotion() {
  const query = useMemo(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null), []);
  const [reduced, setReduced] = useState(Boolean(query?.matches));
  useEffect(() => { if (!query) return undefined; const update = () => setReduced(query.matches); query.addEventListener?.('change', update); return () => query.removeEventListener?.('change', update); }, [query]);
  return reduced;
}

function AvatarCanvas({ spec, scale = 4, label }) {
  const ref = useRef(null);
  useEffect(() => { const ctx = ref.current.getContext('2d'); ctx.clearRect(0, 0, SPRITE_W * scale, SPRITE_H * scale); drawAvatar(ctx, spec, { scale }); }, [spec, scale]);
  return <canvas ref={ref} className="cqpp-pixel" width={SPRITE_W * scale} height={SPRITE_H * scale} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}/>;
}

function SceneCanvas({ spec, sceneId, scale = 3 }) {
  const ref = useRef(null);
  useEffect(() => { drawScene(ref.current.getContext('2d'), spec, { sceneId, scale }); }, [spec, sceneId, scale]);
  return <canvas ref={ref} className="cqpp-pixel" width={SCENE_W * scale} height={SCENE_H * scale} aria-hidden="true"/>;
}

function Brand() {
  return <div className="cqpp-brand"><span className="cqpp-brand-mark" aria-hidden="true">cq</span><span><b>Pixel Passport</b><small>Closet Quest · Campus edition</small></span></div>;
}

function Steps({ current }) {
  const steps = ['Build', 'Quest', 'Keep'];
  return <ol className="cqpp-steps" aria-label="Progress">{steps.map((name, i) => <li key={name} className={i === current ? 'is-current' : i < current ? 'is-done' : ''} aria-current={i === current ? 'step' : undefined}><span aria-hidden="true">{i + 1}</span>{name}</li>)}</ol>;
}

function Swatches({ label, swatches, value, onPick, custom = true }) {
  const known = swatches.some(s => s.hex === value);
  return <fieldset className="cqpp-field"><legend>{label}</legend>
    <div className="cqpp-swatches">
      {swatches.map(s => <button key={s.id} type="button" className="cqpp-swatch" style={{ '--swatch': s.hex }} aria-label={s.label} aria-pressed={s.hex === value} title={s.label} onClick={() => onPick(s.hex)}/>)}
      {custom && <label className={`cqpp-swatch cqpp-swatch-custom${known ? '' : ' is-active'}`} style={{ '--swatch': value }} title="Custom colour">
        <span className="cqpp-sr">Custom colour for {label.toLowerCase()}</span><input type="color" value={value.toLowerCase()} onChange={e => onPick(e.target.value)}/><span aria-hidden="true">+</span></label>}
    </div>
  </fieldset>;
}

function Choices({ label, options, value, onPick }) {
  return <fieldset className="cqpp-field"><legend>{label}</legend>
    <div className="cqpp-chips">{options.map(o => <button key={o.id} type="button" className="cqpp-chip" aria-pressed={o.id === value} onClick={() => onPick(o.id)}>{o.label}</button>)}</div>
  </fieldset>;
}

function Entry({ state, dispatch, photoFirst }) {
  const example = useMemo(() => createDefaultSpec({ presetId: 'green-jacket', nickname: 'Pixel Fern', sceneId: 'coffee-break' }), []);
  const cardRef = useRef(null);
  useEffect(() => { drawCard(cardRef.current.getContext('2d'), example, { config: eventConfig }); }, [example]);
  return <main className="cqpp-screen cqpp-entry">
    <Brand/>
    <h1 tabIndex={-1}>Your outfit.<br/>A tiny adventure.</h1>
    <p className="cqpp-lead">{photoFirst ? 'Snap your outfit and meet your pixel self. Then tweak it and pick your next quest.' : 'Make a playful pixel version of you, keep your outfit, and pick your next quest.'}</p>
    <div className="cqpp-hero" aria-hidden="true">
      <span className="cqpp-spark s1"/><span className="cqpp-spark s2"/><span className="cqpp-spark s3"/>
      <canvas ref={cardRef} className="cqpp-hero-card" width={CARD_W} height={CARD_H}/>
    </div>
    <p className="cqpp-sr">Example: a pixel character called Pixel Fern in a green jacket, waving in a coffee shop.</p>
    <form className="cqpp-form" onSubmit={e => { e.preventDefault(); dispatch({ type: 'start', photoFirst }); }}>
      <label htmlFor="cqpp-nickname">Nickname</label>
      <div className="cqpp-nickname">
        <input id="cqpp-nickname" type="text" autoComplete="off" autoCapitalize="words" spellCheck="false" enterKeyHint="go" value={state.nicknameDraft} maxLength={NICKNAME_MAX * 2} onChange={e => dispatch({ type: 'nickname', value: e.target.value })} aria-describedby="cqpp-nickname-help"/>
        <button type="button" className="cqpp-btn cqpp-btn-quiet" onClick={() => dispatch({ type: 'reroll' })}>Shuffle</button>
      </div>
      <p id="cqpp-nickname-help" className="cqpp-hint">A made-up name is perfect. Up to {NICKNAME_MAX} characters.</p>
      <button type="submit" className="cqpp-btn cqpp-btn-primary">Make my pixel self</button>
      <p className="cqpp-hint cqpp-center">Photo optional. No sign-up. Your card stays private.</p>
    </form>
  </main>;
}

function CaptureSheet({ camera, photos, onPhoto, onClose, hint, skipLabel = 'Skip photo' }) {
  const [mode, setMode] = useState('menu'), [error, setError] = useState(''), [facing, setFacing] = useState('environment'), [ready, setReady] = useState(false);
  const videoRef = useRef(null), fileRef = useRef(null), headingRef = useRef(null), alive = useRef(true);
  useEffect(() => { headingRef.current?.focus(); return () => { alive.current = false; camera.stop(); }; }, [camera]);
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);

  async function startCamera(nextFacing) {
    setError(''); setReady(false); setMode('camera'); setFacing(nextFacing);
    try {
      const stream = await camera.start(nextFacing);
      if (!stream || !alive.current) { if (stream) camera.stop(); return; }
      const video = videoRef.current; if (!video) { camera.stop(); return; }
      video.srcObject = stream; await video.play().catch(() => {}); if (alive.current) setReady(true);
    } catch (e) { camera.stop(); if (alive.current) { setMode('menu'); setError(eventCameraMessage(e)); } }
  }
  function capture() {
    const video = videoRef.current;
    try { const handle = photos.fromFrame(video, video.videoWidth, video.videoHeight); camera.stop(); onPhoto(handle); }
    catch (e) { setError(e.message); }
  }
  async function chooseFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setError('');
    try { const handle = await photos.load(file); if (handle && alive.current) onPhoto(handle); }
    catch (e) { if (alive.current) setError(e.message || 'That photo could not be opened. You can keep building without it.'); }
  }
  return <div className="cqpp-sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="cqpp-sheet" role="dialog" aria-modal="true" aria-labelledby="cqpp-sheet-title">
      <h2 id="cqpp-sheet-title" tabIndex={-1} ref={headingRef}>Outfit photo</h2>
      <p className="cqpp-hint">{hint || 'Optional. Here your photo is only a colour reference on this phone. It is not saved and it is not on your card.'}</p>
      {error && <p className="cqpp-alert" role="alert">{error}</p>}
      {mode === 'camera' ? <>
        <div className="cqpp-camera"><video ref={videoRef} playsInline muted aria-label="Camera preview"/>{!ready && <span>Starting camera…</span>}</div>
        <div className="cqpp-row">
          <button type="button" className="cqpp-btn cqpp-btn-primary" disabled={!ready} onClick={capture}>Use this view</button>
          <button type="button" className="cqpp-btn" onClick={() => startCamera(facing === 'environment' ? 'user' : 'environment')}>Flip camera</button>
        </div>
        <button type="button" className="cqpp-btn cqpp-btn-quiet" onClick={() => { camera.stop(); setMode('menu'); }}>Back</button>
      </> : <>
        <button type="button" className="cqpp-btn cqpp-btn-primary" onClick={() => startCamera('environment')}>Take outfit photo</button>
        <button type="button" className="cqpp-btn" onClick={() => fileRef.current?.click()}>Add outfit photo</button>
        <input ref={fileRef} className="cqpp-sr" type="file" accept={PHOTO_ACCEPT} tabIndex={-1} aria-hidden="true" onChange={chooseFile}/>
        <button type="button" className="cqpp-btn cqpp-btn-quiet" onClick={onClose}>{skipLabel}</button>
      </>}
    </section>
  </div>;
}

function PhotoStep({ state, dispatch, photos, camera, setPhoto }) {
  const [agreed, setAgreed] = useState(false), [sheet, setSheet] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const abort = useRef(null), alive = useRef(true), openButton = useRef(null);
  useEffect(() => () => { alive.current = false; abort.current?.abort(); }, []);
  const closeSheet = useCallback(() => { setSheet(false); camera.stop(); openButton.current?.focus(); }, [camera]);
  async function build(handle) {
    setPhoto(handle); setSheet(false); setError(''); setBusy(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const character = await requestCharacter(handle, { signal: controller.signal });
      if (alive.current && !controller.signal.aborted) dispatch({ type: 'likeness', character });
    } catch (e) { if (alive.current && !controller.signal.aborted) { setBusy(false); setError(e.message); } }
  }
  const byHand = () => { abort.current?.abort(); dispatch({ type: 'go', screen: 'edit' }); };
  return <main className="cqpp-screen">
    <Brand/><Steps current={0}/>
    <h1 tabIndex={-1}>{busy ? 'Building your pixel self…' : 'Start with your look.'}</h1>
    {busy ? <>
      <div className="cqpp-building" role="status" aria-live="polite">
        <div className="cqpp-building-avatar"><AvatarCanvas spec={state.spec} scale={2} label=""/></div>
        <div className="cqpp-loader" aria-hidden="true"><i/><i/><i/><i/><i/></div>
        <p className="cqpp-lead">Matching your outfit, hair and colours. This takes a few seconds.</p>
      </div>
      <button type="button" className="cqpp-btn cqpp-btn-quiet" onClick={byHand}>Skip and build by hand</button>
    </> : <>
      <p className="cqpp-lead">Take a photo of your outfit and we will draw a pixel character that matches it. You can change every detail afterwards.</p>
      {error && <p className="cqpp-alert" role="alert">{error}</p>}
      <label className="cqpp-consent">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}/>
        <span>I agree to send this one photo to Closet Quest and its AI provider, OpenAI, to build my character. It is not saved by Closet Quest and it is not on my card.</span>
      </label>
      <div className="cqpp-actions">
        <button ref={openButton} type="button" className="cqpp-btn cqpp-btn-primary" disabled={!agreed} onClick={() => setSheet(true)}>{error ? 'Try another photo' : 'Use my photo'}</button>
        <button type="button" className="cqpp-btn" onClick={byHand}>Build by hand instead</button>
        <button type="button" className="cqpp-btn cqpp-btn-quiet" onClick={() => dispatch({ type: 'go', screen: 'entry' })}>Back</button>
      </div>
      <p className="cqpp-hint cqpp-center">Best with your whole outfit in view. No photo needed to finish.</p>
    </>}
    {sheet && <CaptureSheet camera={camera} photos={photos} onClose={closeSheet} onPhoto={build} skipLabel="Cancel" hint="This photo will be sent to build your character, as you agreed. Stand back so your whole outfit is in view."/>}
  </main>;
}

const PARTS = [{ id: 'top', label: 'Top', field: 'topColor' }, { id: 'bottom', label: 'Bottom', field: 'bottomColor' }, { id: 'shoes', label: 'Shoes', field: 'shoeColor' }];

function PhotoReference({ photo, part, setPart, spec, dispatch, canUndo, onRemove }) {
  const ref = useRef(null), [mark, setMark] = useState(null), [message, setMessage] = useState('');
  useEffect(() => { const canvas = ref.current; canvas.width = photo.width; canvas.height = photo.height; canvas.getContext('2d').drawImage(photo.canvas, 0, 0); setMark(null); setMessage(''); }, [photo]);
  const parts = isOnePiece(spec) ? PARTS.filter(p => p.id !== 'bottom') : PARTS, active = parts.find(p => p.id === part) || parts[0];
  function sample(event) {
    const box = ref.current.getBoundingClientRect();
    const point = mapPointToSource({ px: event.clientX - box.left, py: event.clientY - box.top, boxW: box.width, boxH: box.height, srcW: photo.width, srcH: photo.height });
    if (!point.inside) return;
    const color = photo.sample(point.x, point.y);
    if (!color) return;
    setMark({ left: `${((event.clientX - box.left) / box.width) * 100}%`, top: `${((event.clientY - box.top) / box.height) * 100}%`, color });
    dispatch({ type: 'edit', field: active.field, value: color, sampled: true });
    setMessage(`Copied that colour to your ${active.label.toLowerCase()}.`);
  }
  return <section className="cqpp-photo" aria-label="Outfit photo reference">
    <div className="cqpp-photo-frame">
      <canvas ref={ref} onClick={sample} aria-label={`Your outfit photo. Tap a spot to copy its colour to your ${active.label.toLowerCase()}.`}/>
      {mark && <span className="cqpp-photo-mark" style={{ left: mark.left, top: mark.top, background: mark.color }} aria-hidden="true"/>}
    </div>
    <div className="cqpp-photo-side">
      <p className="cqpp-hint"><b>Tap your photo</b> to copy a colour to:</p>
      <div className="cqpp-chips" role="group" aria-label="Copy colour to">{parts.map(p => <button key={p.id} type="button" className="cqpp-chip" aria-pressed={p.id === active.id} onClick={() => setPart(p.id)}>{p.label}</button>)}</div>
      <p className="cqpp-hint" aria-live="polite">{message || 'A reference only. It is not saved or put on your card.'}</p>
      <div className="cqpp-row">
        {canUndo && <button type="button" className="cqpp-btn cqpp-btn-small" onClick={() => { dispatch({ type: 'undo' }); setMark(null); setMessage('Colour restored.'); }}>Undo</button>}
        <button type="button" className="cqpp-btn cqpp-btn-small cqpp-btn-quiet" onClick={onRemove}>Remove photo</button>
      </div>
    </div>
  </section>;
}

function Slider({ label, field, spec, edit, ends }) {
  const [min, max] = manifest.sliders[field], id = `cqpp-slider-${field}`;
  return <div className="cqpp-field cqpp-slider"><label htmlFor={id}>{label}</label>
    <div className="cqpp-slider-row"><span aria-hidden="true">{ends[0]}</span><input id={id} type="range" min={min} max={max} step="1" value={spec.appearance[field]} onChange={e => edit(field, Number(e.target.value))}/><span aria-hidden="true">{ends[1]}</span></div></div>;
}

function Editor({ state, dispatch, photo, photos, camera, setPhoto }) {
  const { spec } = state, [tab, setTab] = useState('top'), [sheet, setSheet] = useState(false), [part, setPart] = useState('top');
  const edit = (field, value) => dispatch({ type: 'edit', field, value });
  const onePiece = isOnePiece(spec), sheetButton = useRef(null);
  const closeSheet = useCallback(() => { setSheet(false); camera.stop(); sheetButton.current?.focus(); }, [camera]);
  const removePhoto = () => { photos.dispose(); setPhoto(null); };
  return <main className="cqpp-screen cqpp-editor">
    <Brand/><Steps current={0}/>
    <h1 tabIndex={-1}>Make it feel like you.</h1>
    {state.notice && <p className="cqpp-alert" role="alert">{state.notice}</p>}
    {state.fromPhoto && <p className="cqpp-note" role="status">Built from your photo. It is a playful guess, so change anything you like.</p>}
    <div className="cqpp-stage">
      <div className="cqpp-stage-avatar" key={`${spec.outfit.topId}${spec.outfit.bottomId}${spec.outfit.shoeId}${spec.appearance.hairId}${spec.appearance.headwearId}${spec.appearance.glasses}${spec.appearance.faceId}${spec.appearance.buildId}${spec.appearance.facialHairId}`}>
        <AvatarCanvas spec={spec} scale={2} label={`Your pixel character, ${spec.nickname}`}/>
      </div>
      <span className="cqpp-stage-shadow" aria-hidden="true"/>
      <p className="cqpp-stage-name">{spec.nickname}</p>
    </div>
    {photo
      ? <PhotoReference photo={photo} part={part} setPart={setPart} spec={spec} dispatch={dispatch} canUndo={Boolean(state.undo)} onRemove={removePhoto}/>
      : <button ref={sheetButton} type="button" className="cqpp-btn" onClick={() => setSheet(true)}>Add outfit photo <small>optional</small></button>}

    <fieldset className="cqpp-field"><legend>Starter looks</legend>
      <div className="cqpp-presets">{PRESET_SPECS.map(({ preset: p, spec: presetSpec }) => <button key={p.id} type="button" className="cqpp-preset" aria-pressed={spec.outfit.presetId === p.id} aria-label={`${p.label} starter`} onClick={() => edit('presetId', p.id)}>
        <AvatarCanvas spec={presetSpec} scale={1} label=""/></button>)}</div>
    </fieldset>

    <div className="cqpp-tabs" role="tablist" aria-label="Outfit">
      {[['top', 'Top'], ['bottom', 'Bottom'], ['shoes', 'Shoes']].map(([id, label]) => <button key={id} type="button" role="tab" id={`cqpp-tab-${id}`} aria-selected={tab === id} aria-controls="cqpp-tabpanel" className="cqpp-tab" onClick={() => { setTab(id); setPart(id); }}>{label}</button>)}
    </div>
    <div id="cqpp-tabpanel" role="tabpanel" aria-labelledby={`cqpp-tab-${tab}`} className="cqpp-panel">
      {tab === 'top' && <><Choices label="Top shape" options={manifest.tops} value={spec.outfit.topId} onPick={v => edit('topId', v)}/><Swatches label="Top colour" swatches={manifest.clothingSwatches} value={spec.outfit.topColor} onPick={v => edit('topColor', v)}/></>}
      {tab === 'bottom' && <>{onePiece && <p className="cqpp-hint">A dress covers this layer. Your choice is kept if you switch back.</p>}
        <Choices label="Bottom shape" options={manifest.bottoms} value={spec.outfit.bottomId} onPick={v => edit('bottomId', v)}/><Swatches label="Bottom colour" swatches={manifest.clothingSwatches} value={spec.outfit.bottomColor} onPick={v => edit('bottomColor', v)}/></>}
      {tab === 'shoes' && <><Choices label="Shoe shape" options={manifest.shoes} value={spec.outfit.shoeId} onPick={v => edit('shoeId', v)}/><Swatches label="Shoe colour" swatches={manifest.clothingSwatches} value={spec.outfit.shoeColor} onPick={v => edit('shoeColor', v)}/></>}
    </div>

    <details className="cqpp-details">
      <summary>Hair, skin and extras</summary>
      <Choices label="Hair" options={manifest.hair} value={spec.appearance.hairId} onPick={v => edit('hairId', v)}/>
      <Swatches label="Hair colour" swatches={manifest.hairSwatches} value={spec.appearance.hairColor} onPick={v => edit('hairColor', v)}/>
      <Swatches label="Skin tone" swatches={manifest.skinSwatches} value={spec.appearance.skinColor} onPick={v => edit('skinColor', v)}/>
      <Choices label="Headwear" options={manifest.headwear} value={spec.appearance.headwearId} onPick={v => edit('headwearId', v)}/>
      {spec.appearance.headwearId !== 'none' && <Swatches label="Headwear colour" swatches={manifest.clothingSwatches} value={spec.appearance.headwearColor} onPick={v => edit('headwearColor', v)}/>}
      <Choices label="Glasses" options={[{ id: 'on', label: 'Glasses' }, { id: 'off', label: 'No glasses' }]} value={spec.appearance.glasses ? 'on' : 'off'} onPick={v => edit('glasses', v === 'on')}/>
    </details>

    <details className="cqpp-details">
      <summary>Face and build <small>fine-tune the likeness</small></summary>
      <Choices label="Face shape" options={manifest.faces} value={spec.appearance.faceId} onPick={v => edit('faceId', v)}/>
      <Slider label="Head width" field="headWidth" spec={spec} edit={edit} ends={['Narrow', 'Wide']}/>
      <Slider label="Jaw" field="jaw" spec={spec} edit={edit} ends={['Pointed', 'Broad']}/>
      <Choices label="Eyes" options={manifest.eyes} value={spec.appearance.eyeId} onPick={v => edit('eyeId', v)}/>
      <Swatches label="Eye colour" swatches={manifest.eyeSwatches} value={spec.appearance.eyeColor} onPick={v => edit('eyeColor', v)}/>
      <Slider label="Eye spacing" field="eyeGap" spec={spec} edit={edit} ends={['Close', 'Wide']}/>
      <Choices label="Eyebrows" options={manifest.brows} value={spec.appearance.browId} onPick={v => edit('browId', v)}/>
      <Choices label="Nose" options={manifest.noses} value={spec.appearance.noseId} onPick={v => edit('noseId', v)}/>
      <Choices label="Mouth" options={manifest.mouths} value={spec.appearance.mouthId} onPick={v => edit('mouthId', v)}/>
      <Choices label="Facial hair" options={manifest.facialHair} value={spec.appearance.facialHairId} onPick={v => edit('facialHairId', v)}/>
      <Choices label="Build" options={manifest.builds} value={spec.appearance.buildId} onPick={v => edit('buildId', v)}/>
    </details>

    <div className="cqpp-actions">
      <button type="button" className="cqpp-btn cqpp-btn-primary" onClick={() => dispatch({ type: 'go', screen: 'scene' })}>Choose my quest</button>
      <button type="button" className="cqpp-btn cqpp-btn-quiet" onClick={() => dispatch({ type: 'go', screen: 'entry' })}>Back</button>
      <p className="cqpp-hint cqpp-center">You choose every detail.</p>
    </div>
    {sheet && <CaptureSheet camera={camera} photos={photos} onClose={closeSheet} onPhoto={handle => { setPhoto(handle); setSheet(false); }}/>}
  </main>;
}

function ScenePicker({ state, dispatch }) {
  return <main className="cqpp-screen">
    <Brand/><Steps current={1}/>
    <h1 tabIndex={-1}>Pick your next quest.</h1>
    <p className="cqpp-lead">Same outfit, new scene. You can swap again afterwards.</p>
    <div className="cqpp-scenes">{manifest.scenes.map(scene => <button key={scene.id} type="button" className="cqpp-scene" onClick={() => dispatch({ type: 'scene', sceneId: scene.id })}>
      <SceneCanvas spec={state.spec} sceneId={scene.id}/>
      <span><b>{scene.label}</b><small>{scene.caption}</small></span>
    </button>)}</div>
    <div className="cqpp-actions"><button type="button" className="cqpp-btn cqpp-btn-quiet" onClick={() => dispatch({ type: 'go', screen: 'edit' })}>Back to my character</button></div>
  </main>;
}

function Result({ state, dispatch, exports, reduced, onStartOver }) {
  const { spec } = state, scene = resolveScene(spec);
  const canvasRef = useRef(null), [playing, setPlaying] = useState(false), [run, setRun] = useState(0);
  const [ready, setReady] = useState(null), [exportError, setExportError] = useState(''), [status, setStatus] = useState(''), [confirm, setConfirm] = useState(false);

  // Reveal: play roughly two seconds once, then rest on the static hero pose.
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    drawCard(ctx, spec, { frame: null, config: eventConfig });
    if (reduced) { setPlaying(false); return undefined; }
    let frame = 0, last = 0, raf = 0; setPlaying(true);
    const tick = now => {
      if (now - last >= FRAME_MS) { last = now; if (frame >= REVEAL_FRAMES) { drawCard(ctx, spec, { frame: null, config: eventConfig }); setPlaying(false); return; } drawCard(ctx, spec, { frame, config: eventConfig }); frame++; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spec, reduced, run]);

  // Prepare the PNG ahead of the tap so sharing keeps its user activation.
  useEffect(() => {
    let cancelled = false; setReady(null); setExportError(''); setStatus('');
    renderCardBlob(spec, { config: eventConfig }).then(blob => { if (cancelled) return; const current = exports.set(blob); setReady({ url: current.url, file: cardFile(blob) }); },
      () => { if (!cancelled) setExportError('Your card could not be turned into an image on this browser. A screenshot of this page works as a souvenir too.'); });
    return () => { cancelled = true; };
  }, [spec, exports]);

  const shareable = ready && canShareFile(typeof navigator === 'undefined' ? null : navigator, ready.file);
  function save() { setStatus(requestDownload(ready.url) ? 'Download requested. Look in Photos, Files or Downloads. Nothing there? Use “Open image”, then press and hold it to save.' : 'The download could not start. Use “Open image”, then press and hold it to save.'); }
  async function share() { const outcome = await shareCard(navigator, ready.file); setStatus(outcome === 'shared' ? 'Share sheet finished.' : outcome === 'cancelled' ? 'Sharing cancelled. Your card is still ready.' : 'Sharing is not available right now. Save the card instead.'); }

  return <main className="cqpp-screen cqpp-result">
    <Brand/><Steps current={2}/>
    <h1 tabIndex={-1}>Side quest unlocked.</h1>
    <p className="cqpp-lead">{TAGLINE} Your souvenir is ready.</p>
    <div className={`cqpp-card-wrap${playing ? ' is-playing' : ''}`} key={run}>
      {!reduced && <div className="cqpp-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }}/>)}</div>}
      <canvas ref={canvasRef} className="cqpp-card" width={CARD_W} height={CARD_H} role="img" aria-label={`Souvenir card. ${spec.nickname} at ${scene.label}. ${scene.caption}`}/>
    </div>
    <div className="cqpp-row cqpp-row-tight">
      <button type="button" className="cqpp-btn cqpp-btn-small" onClick={() => setRun(n => n + 1)} disabled={reduced || playing}>Replay</button>
      <button type="button" className="cqpp-btn cqpp-btn-small" aria-pressed={!reduced} onClick={() => dispatch({ type: 'edit', field: 'motion', value: reduced ? 'full' : 'reduced' })}>Motion {reduced ? 'off' : 'on'}</button>
    </div>
    <div className="cqpp-actions">
      <button type="button" className="cqpp-btn cqpp-btn-primary" disabled={!ready} onClick={save}>{ready || exportError ? 'Save my card' : 'Preparing your card…'}</button>
      {shareable && <button type="button" className="cqpp-btn" onClick={share}>Share…</button>}
      {ready && <a className="cqpp-link" href={ready.url} target="_blank" rel="noopener">Open image</a>}
      <p className="cqpp-hint cqpp-center" role="status" aria-live="polite">{exportError || status || 'Your card stays private. It is saved only if you save it.'}</p>
    </div>
    <fieldset className="cqpp-field"><legend>Choose another scene</legend>
      <div className="cqpp-chips">{manifest.scenes.map(s => <button key={s.id} type="button" className="cqpp-chip" aria-pressed={s.id === spec.sceneId} onClick={() => dispatch({ type: 'scene', sceneId: s.id })}>{s.label}</button>)}</div>
    </fieldset>
    <div className="cqpp-actions">
      <button type="button" className="cqpp-btn" onClick={() => dispatch({ type: 'go', screen: 'edit' })}>Edit character</button>
      <a className="cqpp-btn cqpp-btn-quiet" href="/">Explore Closet Quest</a>
      <p className="cqpp-hint cqpp-center">Closet Quest helps you find new outfits in the clothes you already own.</p>
      {confirm
        ? <div className="cqpp-confirm" role="group" aria-label="Start over?"><p>Start over? This clears this character and card from the page.</p><div className="cqpp-row"><button type="button" className="cqpp-btn cqpp-btn-small" onClick={onStartOver}>Yes, start over</button><button type="button" className="cqpp-btn cqpp-btn-small cqpp-btn-quiet" onClick={() => setConfirm(false)}>Keep my card</button></div></div>
        : <button type="button" className="cqpp-link" onClick={() => setConfirm(true)}>Start over for the next person</button>}
    </div>
  </main>;
}

function Unavailable() {
  return <main className="cqpp-screen cqpp-entry"><Brand/><h1 tabIndex={-1}>Pixel Passport is taking a break.</h1><p className="cqpp-lead">This activity is not open right now. Thanks for stopping by.</p><a className="cqpp-btn" href="/">Explore Closet Quest</a></main>;
}

export function PixelPassport() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState());
  const systemReduced = useSystemReducedMotion(), reduced = prefersReducedMotion(state.spec, systemReduced);
  const photos = useMemo(() => createPhotoStore(), []), exports = useMemo(() => createExportStore(), []);
  const camera = useMemo(() => createEventCamera(typeof navigator === 'undefined' ? null : navigator.mediaDevices), []);
  const [photo, setPhoto] = useState(null), rootRef = useRef(null);
  // Ask once whether the photo step is switched on. If not, the hand-built flow is used.
  const [photoFirst, setPhotoFirst] = useState(false);
  useEffect(() => { let active = true; likenessAvailable().then(ok => { if (active) setPhotoFirst(ok); }); return () => { active = false; }; }, []);
  // Leaving the route releases the camera, the photo reference and the export.
  useEffect(() => () => { camera.stop(); photos.dispose(); exports.dispose(); }, [camera, photos, exports]);
  useEffect(() => { const previous = document.title; document.title = 'Pixel Passport · Closet Quest'; return () => { document.title = previous; }; }, []);
  const firstScreen = useRef(true);
  useEffect(() => { if (firstScreen.current) { firstScreen.current = false; return; } rootRef.current?.scrollTo?.(0, 0); rootRef.current?.querySelector('h1')?.focus?.({ preventScroll: true }); }, [state.screen]);
  // Clears event resources only. Account, wardrobe and browser storage are never touched.
  const startOver = useCallback(() => { camera.stop(); photos.dispose(); exports.dispose(); setPhoto(null); dispatch({ type: 'reset' }); }, [camera, photos, exports]);
  return <div className="cqpp" ref={rootRef} data-motion={reduced ? 'reduced' : 'full'} data-screen={state.screen}>
    {state.screen === 'entry' && <Entry state={state} dispatch={dispatch} photoFirst={photoFirst}/>}
    {state.screen === 'photo' && <PhotoStep state={state} dispatch={dispatch} photos={photos} camera={camera} setPhoto={setPhoto}/>}
    {state.screen === 'edit' && <Editor state={state} dispatch={dispatch} photo={photo} photos={photos} camera={camera} setPhoto={setPhoto}/>}
    {state.screen === 'scene' && <ScenePicker state={state} dispatch={dispatch}/>}
    {state.screen === 'result' && <Result state={state} dispatch={dispatch} exports={exports} reduced={reduced} onStartOver={startOver}/>}
  </div>;
}

class EventBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="cqpp"><main className="cqpp-screen cqpp-entry"><Brand/><h1 tabIndex={-1}>That did not load properly.</h1><p className="cqpp-lead">Nothing was saved or sent. Reload to start a fresh character.</p><button type="button" className="cqpp-btn cqpp-btn-primary" onClick={() => window.location.reload()}>Reload</button></main></div>;
  }
}

export default function PixelPassportRoot() {
  return <EventBoundary>{eventConfig.enabled ? <PixelPassport/> : <div className="cqpp"><Unavailable/></div>}</EventBoundary>;
}
