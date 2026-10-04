import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';

test('compare-primary: percentile tables, grade percentiles and England averages for the primary schools', async () => {
  const { metadata } = await buildFromFixtures('compare-primary', 'primary');
  const quantiles = metadata.compareQuantiles as Record<string, number[]>;
  assert.equal(quantiles.rwmExpected.length, 101);
  assert.ok(quantiles.rwmExpected.every((v, i, a) => i === 0 || v >= a[i - 1]), 'percentile points never go down');
  assert.equal(quantiles.p8, undefined, 'no secondary measures here');
  const averages = (metadata.compareAverages as { state: Record<string, number | null>; all?: unknown }).state;
  assert.ok(averages.rwmExpected !== null && averages.rwmExpected > 0 && averages.rwmExpected <= 100);
  assert.ok('readProgress' in averages && 'absence' in averages && 'ofstedGoodPct' in averages);
  assert.equal((metadata.compareAverages as { all?: unknown }).all, undefined, 'every primary school is state-funded: one set of averages');
});

test('compare-primary: adds no columns of its own', async () => {
  const { rows } = await buildFromFixtures('compare-primary', 'primary');
  assert.equal(rows('compare-primary').size, 0);
});
