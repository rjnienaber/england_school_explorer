import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linearFit } from '../../lib/stats.ts';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';

test('intake-model: results are measured against a fit through non-selective state schools', async () => {
  const { rows } = await buildFromFixtures('intake-model');
  const gias = rows('gias-core');
  const ks4 = rows('ks4-headline');
  const mine = rows('intake-model');

  // Repeat the model by hand for the latest year: Att8 fitted on % disadvantaged
  const state = [...ks4].filter(([urn, k]) => gias.get(urn)?.sector === 'state' && k.ks4Year === '2024/25' && k.att8 !== null && k.disadvantagedPct !== null);
  const fit = linearFit(state.filter(([urn]) => gias.get(urn)?.selective === false).map(([, k]) => [k.disadvantagedPct as number, k.att8 as number]));
  assert.ok(state.length >= 8, 'the fixture needs enough schools for a fit');
  for (const [urn, k] of state) {
    const expected = (k.att8 as number) - (fit.intercept + fit.slope * (k.disadvantagedPct as number));
    assert.ok(Math.abs((mine.get(urn)?.att8VsIntake as number) - expected) < 0.06, `${urn}: ${String(mine.get(urn)?.att8VsIntake)} vs ${expected}`);
  }
  assert.equal(mine.size, state.length);
});

test('intake-model: a grammar school beats its expected score; schools without data or independent ones get no row', async () => {
  const { rows } = await buildFromFixtures('intake-model');
  const mine = rows('intake-model');
  assert.ok((mine.get(101361)?.att8VsIntake as number) > 10);
  assert.equal(mine.has(100001), false); // independent
  assert.equal(mine.has(109694), false); // every result suppressed
  for (const [urn, row] of mine) {
    const pct = row.att8VsIntakePct as number | null;
    assert.ok(pct !== null && pct >= 0 && pct <= 100, `${urn} percentile ${String(pct)}`);
  }
});
