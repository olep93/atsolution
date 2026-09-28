import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel, validJob, readPassword } from '../src/shared.js';

test('a published job requires photos; title and captions have useful limits', () => {
  const draft = { title: 'Service', body: '', status: 'draft', photos: [] };
  assert.equal(validJob(draft), draft);
  assert.throws(() => validJob({ ...draft, status: 'published' }), /minst ett bilde/);
  assert.throws(() => validJob({ ...draft, title: '  ' }), /tittel/);
  assert.throws(() => validJob({ ...draft, photos: [{ caption: 'x'.repeat(501) }] }), /Bildetekster/);
});
test('bad dates never crash the public archive', () => {
  assert.equal(dateLabel(null), '');
  assert.equal(dateLabel('infinity'), '');
  assert.equal(dateLabel('10000-01-01'), '');
  assert.match(dateLabel('2026-09-28'), /2026/);
});
test('password setup rejects short or mismatching passwords', () => {
  const form = (password, confirm) => ({ elements: { password: { value: password }, confirm: { value: confirm } } });
  assert.throws(() => readPassword(form('short', 'short')), /12 tegn/);
  assert.throws(() => readPassword(form('a longer password', 'different')), /ikke like/);
  assert.equal(readPassword(form('a longer password', 'a longer password')), 'a longer password');
});
