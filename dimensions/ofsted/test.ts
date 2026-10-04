import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleRows, skipWithoutStore } from '../../lib/test-store.ts';
import { OFSTED_SUMMARIES } from './grades.ts';
import { module } from './build.ts';

test('ofsted: a known school with a short inspection', skipWithoutStore, () => {
  const r = moduleRows('ofsted', module.fields).get(100049);
  assert.ok(r);
  assert.equal(r.ofstedFramework, 'ungraded');
  assert.equal(r.ofstedDate, '2025-01-29');
  assert.equal(r.ungradedOutcome, 'Standards maintained');
  assert.equal(r.ofstedSummary, null);
});

test('ofsted: summaries are one of the four levels', skipWithoutStore, () => {
  for (const [urn, r] of moduleRows('ofsted', module.fields)) {
    const s = r.ofstedSummary as string | null;
    assert.ok(s === null || (OFSTED_SUMMARIES as readonly string[]).includes(s), `${urn}: ${String(s)}`);
  }
});
