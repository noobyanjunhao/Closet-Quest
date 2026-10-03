export const PREFERENCE_OPTIONS = Object.freeze({
  styles: ['Minimal', 'Classic', 'Casual', 'Streetwear', 'Tailored', 'Vintage', 'Sporty', 'Romantic', 'Bold'],
  colors: ['Black', 'White', 'Gray', 'Navy', 'Blue', 'Green', 'Brown', 'Beige', 'Red', 'Pink', 'Purple', 'Yellow', 'Orange'],
  fit: ['Any', 'Relaxed', 'Regular', 'Fitted'],
  priorities: ['Comfort', 'Rewear favorites', 'Rediscover pieces', 'Versatility', 'Simple outfits', 'Creative combinations'],
  recognitionProvider: ['local', 'openai'],
  recommendationProvider: ['auto', 'local', 'openai', 'quick'],
  embeddingProvider: ['local', 'openai'],
  modelProfile: ['fast', 'balanced', 'deep'],
});

function enumValue(value, options, fallback) {
  return typeof value === 'string' ? options.find(option => option.toLowerCase() === value.trim().toLowerCase()) || fallback : fallback;
}

function choices(value, options, limit) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => enumValue(item, options, null)).filter(Boolean))].slice(0, limit);
}

// This shape is shared by the interface and server; unknown fields never enter model context.
export function normalizePreferences(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const avoidColors = choices(value.avoidColors, PREFERENCE_OPTIONS.colors, 8);
  return {
    recognitionProvider: enumValue(value.recognitionProvider, PREFERENCE_OPTIONS.recognitionProvider, 'local'),
    recommendationProvider: enumValue(value.recommendationProvider, PREFERENCE_OPTIONS.recommendationProvider, 'auto'),
    embeddingProvider: enumValue(value.embeddingProvider, PREFERENCE_OPTIONS.embeddingProvider, 'local'),
    modelProfile: enumValue(value.modelProfile, PREFERENCE_OPTIONS.modelProfile, 'fast'),
    styles: choices(value.styles, PREFERENCE_OPTIONS.styles, 6),
    colors: choices(value.colors, PREFERENCE_OPTIONS.colors, 8).filter(color => !avoidColors.includes(color)),
    avoidColors,
    fit: enumValue(value.fit, PREFERENCE_OPTIONS.fit, 'Any'),
    priorities: choices(value.priorities, PREFERENCE_OPTIONS.priorities, 4),
    notes: typeof value.notes === 'string' ? value.notes.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500) : '',
  };
}

// User-authored notes are preference data, not trusted instructions for the model.
export function preferenceText(input) {
  const value = normalizePreferences(input);
  return [
    value.styles.length && `Preferred styles: ${value.styles.join(', ')}.`,
    value.colors.length && `Preferred colors: ${value.colors.join(', ')}.`,
    value.avoidColors.length && `Avoid colors: ${value.avoidColors.join(', ')}.`,
    value.fit !== 'Any' && `Preferred fit: ${value.fit}.`,
    value.priorities.length && `Priorities: ${value.priorities.join(', ')}.`,
    value.notes && `User preference note: ${value.notes}`,
  ].filter(Boolean).join(' ');
}

export function setRecommendationFeedback(history, runId, feedback, now = new Date().toISOString()) {
  if (!Array.isArray(history) || typeof runId !== 'string' || !['helpful', 'not-for-me', null].includes(feedback)) return history;
  return history.map(run => run?.runId === runId ? { ...run, feedback, feedbackAt: now } : run);
}
