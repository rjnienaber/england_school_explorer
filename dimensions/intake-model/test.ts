import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleRows, skipWithoutStore } from '../../lib/test-store.ts';
import { module } from './build.ts';

test('intake-model: a known school and sensible percentiles', skipWithoutStore, () => {
  const rows = moduleRows('intake-model', module.fields);
  const r = rows.get(100049);
  assert.ok(r);
  assert.equal(r.att8VsIntake, 9.1);
  assert.equal(r.att8VsIntakePct, 87);
  for (const [urn, row] of rows) {
    const pct = row.att8VsIntakePct as number | null;
    assert.ok(pct === null || (pct >= 0 && pct <= 100), `${urn} percentile ${String(pct)}`);
  }
});
