import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, preferenceText, setRecommendationFeedback } from '../src/preferences.js';

test('preferences accept bounded supported values and discard malformed choices', () => {
  const result = normalizePreferences({ recognitionProvider: 'OPENAI', recommendationProvider: 'quick', modelProfile: 'deep', styles: ['casual', 'Casual', {}, 'invented', 'Minimal'], colors: [' Navy ', 'blue', null], fit: 'relaxed', priorities: ['Comfort', 'Comfort'], notes: '  Prefers\ncomfortable\u0000layers.  ', apiKey: 'must not survive' });
  assert.deepEqual(result.styles, ['Casual', 'Minimal']);
  assert.deepEqual(result.colors, ['Navy', 'Blue']);
  assert.equal(result.fit, 'Relaxed');
  assert.equal(result.recognitionProvider, 'openai');
  assert.equal(result.recommendationProvider, 'quick');
  assert.equal(result.modelProfile, 'deep');
  assert.equal(result.notes, 'Prefers comfortable layers.');
  assert.equal('apiKey' in result, false);
  assert.deepEqual(result.priorities, ['Comfort']);
  assert.equal(normalizePreferences({ notes: 'a'.repeat(900) }).notes.length, 500);
});

test('avoided colors win conflicts and absent preferences use local photo processing', () => {
  const result = normalizePreferences({ colors: ['Blue', 'Navy'], avoidColors: ['BLUE', 'blue'], fit: 'baggy', recognitionProvider: 'external', modelProfile: 'imaginary' });
  assert.deepEqual(result.colors, ['Navy']);
  assert.deepEqual(result.avoidColors, ['Blue']);
  assert.equal(result.recognitionProvider, 'local');
  assert.equal(result.fit, 'Any');
  assert.equal(result.modelProfile, 'fast');
  assert.equal(result.embeddingProvider, 'local');
  assert.equal(normalizePreferences({ embeddingProvider: 'OPENAI' }).embeddingProvider, 'openai');
  assert.equal(normalizePreferences({ embeddingProvider: 'https://unknown.example' }).embeddingProvider, 'local');
  for (const invalid of [null, false, 42, 'text', []]) assert.deepEqual(normalizePreferences(invalid), normalizePreferences());
});

test('model context contains only normalized preferences, without routing settings', () => {
  assert.equal(preferenceText({}), '');
  const text = preferenceText({ styles: ['Casual'], avoidColors: ['Red'], fit: 'Regular', notes: 'I walk to work.', recognitionProvider: 'openai', modelProfile: 'deep' });
  assert.match(text, /Preferred styles: Casual/);
  assert.match(text, /Avoid colors: Red/);
  assert.match(text, /Preferred fit: Regular/);
  assert.match(text, /User preference note: I walk to work\./);
  assert.doesNotMatch(text, /openai|deep/);
});

test('feedback updates only its recorded run and rejects unknown feedback values', () => {
  const history = [{ runId: 'a', feedback: null, chosenItemIds: ['owned-1'] }, { runId: 'b', feedback: 'helpful' }];
  const result = setRecommendationFeedback(history, 'a', 'not-for-me', '2026-10-02T12:00:00Z');
  assert.equal(history[0].feedback, null);
  assert.equal(result[0].feedback, 'not-for-me');
  assert.equal(result[0].feedbackAt, '2026-10-02T12:00:00Z');
  assert.deepEqual(result[0].chosenItemIds, ['owned-1']);
  assert.equal(result[1], history[1]);
  assert.equal(setRecommendationFeedback(history, 'a', 'arbitrary-command'), history);
  assert.equal(setRecommendationFeedback(result, 'a', null)[0].feedback, null);
});
