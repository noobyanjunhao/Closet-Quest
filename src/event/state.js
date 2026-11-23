// Character specification, validation and screen reducer for Pixel Passport.
// Pure functions only: no DOM, storage or network. The specification never
// contains a photograph, account data or any identifier beyond the event ID.
import { manifest as defaultManifest, has, lookup } from './manifest.js';
import { eventConfig } from './event-config.js';

export const NICKNAME_MAX = 20;
export const FALLBACK_NICKNAME = 'Pixel Pal';
const HEX = /^#[0-9A-F]{6}$/;
const OUTFIT_KEYS = ['presetId', 'topId', 'topColor', 'bottomId', 'bottomColor', 'shoeId', 'shoeColor'];
const APPEARANCE_KEYS = ['skinColor', 'hairId', 'hairColor', 'headwearId', 'headwearColor', 'glasses', 'faceId', 'buildId', 'eyeId', 'eyeColor', 'browId', 'noseId', 'mouthId', 'facialHairId', 'headWidth', 'jaw', 'eyeGap'];
// Face and body parts chosen from a list, and the three whole-number sliders.
const FACE_PARTS = Object.freeze({ faceId: 'faces', buildId: 'builds', eyeId: 'eyes', browId: 'brows', noseId: 'noses', mouthId: 'mouths', facialHairId: 'facialHair' });
const inRange = (value, [low, high]) => Number.isInteger(value) && value >= low && value <= high;
const SPEC_KEYS = ['schemaVersion', 'rendererVersion', 'eventId', 'nickname', 'outfit', 'appearance', 'sceneId', 'motion'];

// Control characters, bidi overrides/isolates and invisible marks that could
// reorder or hide text on a shared card.
const UNSAFE = /[\p{Cc}؜​‎‏‪-‮⁠-⁩﻿￹-￻]/gu;

export function normalizeNickname(value) {
  if (typeof value !== 'string') return FALLBACK_NICKNAME;
  const cleaned = value.normalize('NFC').replace(UNSAFE, '').replace(/\s+/gu, ' ').trim();
  const clipped = Array.from(cleaned).slice(0, NICKNAME_MAX).join('').trim();
  return clipped || FALLBACK_NICKNAME;
}

// While typing we keep trailing spaces usable but still strip unsafe characters.
export function sanitizeNicknameInput(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.normalize('NFC').replace(UNSAFE, '').replace(/\s+/gu, ' ').replace(/^ /, '');
  return Array.from(cleaned).slice(0, NICKNAME_MAX).join('');
}

export function randomNickname(random = Math.random, manifest = defaultManifest) {
  const pick = list => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  return `${pick(manifest.nicknameWords.first)} ${pick(manifest.nicknameWords.second)}`;
}

export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return HEX.test(upper) ? upper : null;
}

export function createDefaultSpec({ presetId = 'green-jacket', nickname = 'Pixel Fern', sceneId = 'coffee-break' } = {}) {
  const preset = lookup('presets', presetId) || defaultManifest.presets[0];
  return {
    schemaVersion: 1,
    rendererVersion: defaultManifest.rendererVersion,
    eventId: eventConfig.eventId,
    nickname: normalizeNickname(nickname),
    outfit: { presetId: preset.id, ...preset.outfit },
    appearance: { ...preset.appearance },
    sceneId: has('scenes', sceneId) ? sceneId : defaultManifest.scenes[0].id,
    motion: 'system'
  };
}

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function unknownKeys(object, allowed, prefix, errors) {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) errors.push(`${prefix}${key} is not a supported field`);
}

// Returns { ok, errors, spec }. `spec` is a fresh, normalized copy built field
// by field (never spread from the input) and is only present when ok is true.
export function validateSpec(input, manifest = defaultManifest) {
  const errors = [];
  if (!plain(input)) return { ok: false, errors: ['Character must be an object'], spec: null };
  unknownKeys(input, SPEC_KEYS, '', errors);
  if (input.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (input.rendererVersion !== manifest.rendererVersion) errors.push('rendererVersion is not supported');
  if (typeof input.eventId !== 'string' || !manifest.eventIds.includes(input.eventId)) errors.push('eventId is not recognised');
  if (typeof input.nickname !== 'string' || normalizeNickname(input.nickname) !== input.nickname) errors.push('nickname must be normalized text of at most 20 characters');
  if (!has('scenes', input.sceneId)) errors.push('sceneId is not recognised');
  if (!manifest.motions.includes(input.motion)) errors.push('motion must be system, reduced or full');

  const outfit = input.outfit, appearance = input.appearance;
  if (!plain(outfit)) errors.push('outfit must be an object');
  else {
    unknownKeys(outfit, OUTFIT_KEYS, 'outfit.', errors);
    if (!has('presets', outfit.presetId)) errors.push('outfit.presetId is not recognised');
    if (!has('tops', outfit.topId)) errors.push('outfit.topId is not recognised');
    if (!has('bottoms', outfit.bottomId)) errors.push('outfit.bottomId is not recognised');
    if (!has('shoes', outfit.shoeId)) errors.push('outfit.shoeId is not recognised');
    for (const key of ['topColor', 'bottomColor', 'shoeColor']) if (typeof outfit[key] !== 'string' || !HEX.test(outfit[key])) errors.push(`outfit.${key} must be a six-digit hex colour`);
  }
  if (!plain(appearance)) errors.push('appearance must be an object');
  else {
    unknownKeys(appearance, APPEARANCE_KEYS, 'appearance.', errors);
    if (!has('hair', appearance.hairId)) errors.push('appearance.hairId is not recognised');
    if (!has('headwear', appearance.headwearId)) errors.push('appearance.headwearId is not recognised');
    for (const key of ['skinColor', 'hairColor', 'headwearColor']) if (typeof appearance[key] !== 'string' || !HEX.test(appearance[key])) errors.push(`appearance.${key} must be a six-digit hex colour`);
    if (typeof appearance.glasses !== 'boolean') errors.push('appearance.glasses must be true or false');
    for (const [key, table] of Object.entries(FACE_PARTS)) if (!has(table, appearance[key])) errors.push(`appearance.${key} is not recognised`);
    if (typeof appearance.eyeColor !== 'string' || !HEX.test(appearance.eyeColor)) errors.push('appearance.eyeColor must be a six-digit hex colour');
    for (const [key, range] of Object.entries(manifest.sliders)) if (!inRange(appearance[key], range)) errors.push(`appearance.${key} is out of range`);
  }
  if (errors.length) return { ok: false, errors, spec: null };
  return {
    ok: true, errors,
    spec: {
      schemaVersion: 1, rendererVersion: input.rendererVersion, eventId: input.eventId, nickname: input.nickname,
      outfit: { presetId: outfit.presetId, topId: outfit.topId, topColor: outfit.topColor, bottomId: outfit.bottomId, bottomColor: outfit.bottomColor, shoeId: outfit.shoeId, shoeColor: outfit.shoeColor },
      appearance: { skinColor: appearance.skinColor, hairId: appearance.hairId, hairColor: appearance.hairColor, headwearId: appearance.headwearId, headwearColor: appearance.headwearColor, glasses: appearance.glasses, faceId: appearance.faceId, buildId: appearance.buildId, eyeId: appearance.eyeId, eyeColor: appearance.eyeColor, browId: appearance.browId, noseId: appearance.noseId, mouthId: appearance.mouthId, facialHairId: appearance.facialHairId, headWidth: appearance.headWidth, jaw: appearance.jaw, eyeGap: appearance.eyeGap },
      sceneId: input.sceneId, motion: input.motion
    }
  };
}

const EDITS = {
  topId: ['outfit', 'tops'], bottomId: ['outfit', 'bottoms'], shoeId: ['outfit', 'shoes'],
  hairId: ['appearance', 'hair'], headwearId: ['appearance', 'headwear'],
  topColor: ['outfit'], bottomColor: ['outfit'], shoeColor: ['outfit'],
  skinColor: ['appearance'], hairColor: ['appearance'], headwearColor: ['appearance'],
  eyeColor: ['appearance'], ...Object.fromEntries(Object.entries(FACE_PARTS).map(([field, table]) => [field, ['appearance', table]]))
};

// Applies one named edit. An invalid edit returns the same specification
// object unchanged, so a bad value can never reach the renderer.
export function applyEdit(spec, field, value) {
  if (field === 'nickname') return { ...spec, nickname: normalizeNickname(value) };
  if (field === 'glasses') return typeof value === 'boolean' ? { ...spec, appearance: { ...spec.appearance, glasses: value } } : spec;
  if (Object.hasOwn(defaultManifest.sliders, field)) return inRange(value, defaultManifest.sliders[field]) && spec.appearance[field] !== value ? { ...spec, appearance: { ...spec.appearance, [field]: value } } : spec;
  if (field === 'motion') return defaultManifest.motions.includes(value) ? { ...spec, motion: value } : spec;
  if (field === 'sceneId') return has('scenes', value) ? { ...spec, sceneId: value } : spec;
  if (field === 'presetId') {
    // Choosing a preset is the one edit that replaces the outfit and appearance.
    const preset = lookup('presets', value);
    return preset ? { ...spec, outfit: { presetId: preset.id, ...preset.outfit }, appearance: { ...preset.appearance } } : spec;
  }
  const rule = Object.hasOwn(EDITS, field) ? EDITS[field] : null;
  if (!rule) return spec;
  const [group, table] = rule;
  const next = table ? (has(table, value) ? value : null) : normalizeHex(value);
  if (next === null || spec[group][field] === next) return spec;
  return { ...spec, [group]: { ...spec[group], [field]: next } };
}

const CHARACTER_FIELDS = Object.freeze({ outfit: ['topId', 'topColor', 'bottomId', 'bottomColor', 'shoeId', 'shoeColor'], appearance: APPEARANCE_KEYS });

// Applies character settings that came from outside the page (the photo step).
// Only known fields are read, each through applyEdit, so anything unexpected is ignored.
export function applyCharacter(spec, character) {
  let next = spec;
  for (const group of ['outfit', 'appearance']) {
    const values = character?.[group];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    for (const field of CHARACTER_FIELDS[group]) if (Object.hasOwn(values, field)) next = applyEdit(next, field, values[field]);
  }
  return next;
}

export function resolveScene(spec, manifest = defaultManifest) {
  return manifest.scenes.find(scene => scene.id === spec.sceneId) || manifest.scenes[0];
}

export function isOnePiece(spec) { return Boolean(lookup('tops', spec.outfit.topId)?.onePiece); }

export function prefersReducedMotion(spec, systemReduced) {
  return spec.motion === 'reduced' || (spec.motion === 'system' && Boolean(systemReduced));
}

export const SCREENS = Object.freeze(['entry', 'photo', 'edit', 'scene', 'result']);

export function createInitialState(random = Math.random) {
  const nickname = randomNickname(random);
  return { screen: 'entry', nicknameDraft: nickname, spec: createDefaultSpec({ nickname }), undo: null, notice: '', fromPhoto: false };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'nickname': return { ...state, nicknameDraft: sanitizeNicknameInput(action.value) };
    case 'reroll': return { ...state, nicknameDraft: randomNickname(action.random) };
    case 'start': {
      // entry -> edit with a complete draft. No network, camera or storage work.
      const nickname = normalizeNickname(state.nicknameDraft);
      return { ...state, screen: action.photoFirst ? 'photo' : 'edit', nicknameDraft: nickname, spec: applyEdit(state.spec, 'nickname', nickname) };
    }
    case 'edit': {
      const spec = applyEdit(state.spec, action.field, action.value);
      if (spec === state.spec) return state;
      const undo = action.sampled ? { field: action.field, value: state.spec[action.field in state.spec.outfit ? 'outfit' : 'appearance'][action.field] } : null;
      return { ...state, spec, undo };
    }
    case 'likeness': {
      // photo -> edit with the character the photo step suggested. Still fully editable.
      const spec = applyCharacter(state.spec, action.character);
      return validateSpec(spec).ok ? { ...state, spec, screen: 'edit', undo: null, notice: '', fromPhoto: spec !== state.spec } : { ...state, screen: 'edit' };
    }
    case 'undo': return state.undo ? { ...state, spec: applyEdit(state.spec, state.undo.field, state.undo.value), undo: null } : state;
    case 'go': {
      if (!SCREENS.includes(action.screen)) return state;
      if (action.screen === 'scene' || action.screen === 'result') {
        const checked = validateSpec(state.spec);
        // A failed check keeps the visitor on a usable editor with a visible note.
        if (!checked.ok) return { ...state, screen: 'edit', notice: 'Something in this character needs another look. Pick a starter to continue.' };
      }
      return { ...state, screen: action.screen, notice: '', undo: null };
    }
    case 'scene': {
      if (!has('scenes', action.sceneId)) return state;
      const spec = applyEdit(state.spec, 'sceneId', action.sceneId);
      return validateSpec(spec).ok ? { ...state, spec, screen: 'result', notice: '' } : state;
    }
    case 'reset': return createInitialState(action.random);
    default: return state;
  }
}
