import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { loadPriorAttainment } from './parse.ts';

// The KS4 file belongs to ks4-headline, so that is where its fixture lives
const fixture = new URL('../ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('prior attainment parser: groups by year, and suppression codes become null', async () => {
  const prior = await loadPriorAttainment(fixture);
  const haverstock = prior.get(100049)!;
  assert.deepEqual([...haverstock.keys()].sort(), ['2022/23', '2023/24']); // none for 2024/25
  assert.deepEqual(haverstock.get('2023/24')!.get('Low'), { pct: 16.7, att8: 22.1, p8: -0.58, p8Lower: -1.12, p8Upper: -0.03 });
  assert.equal(haverstock.get('2023/24')!.get('High')!.att8, 68);
  // The independent school has rows, every value "z"
  assert.deepEqual(prior.get(100001)!.get('2023/24')!.get('Mid'), { pct: null, att8: null, p8: null, p8Lower: null, p8Upper: null });
  // Total and Disadvantaged rows are not prior-attainment groups, so 2024/25 has nothing
  assert.equal(prior.get(100049)!.get('2024/25'), undefined);
});

test('ks4-prior-attainment: a known school, with bands from the confidence intervals', async () => {
  const { rows } = await buildFromFixtures('ks4-prior-attainment');
  const r = rows('ks4-prior-attainment').get(100049);
  assert.ok(r);
  assert.equal(r.priorYear, '2023/24'); // newer than 2022/23, older than the headline year 2024/25
  assert.equal(r.priorLowPct, 16.7);
  assert.equal(r.priorLowAtt8, 22.1);
  assert.equal(r.priorLowP8, -0.58);
  assert.equal(r.priorLowP8Band, 'well-below'); // interval -1.12 to -0.03 is below zero and the score is beyond -0.5
  assert.equal(r.priorMidP8Band, 'average'); // interval -0.49 to 0.11 spans zero
  assert.equal(r.priorHighAtt8, 68);
  // Parliament Hill: interval -0.26 to 1.22 spans zero even though the score is 0.48
  assert.equal(rows('ks4-prior-attainment').get(100050)?.priorLowP8Band, 'average');
  assert.equal(rows('ks4-prior-attainment').get(100050)?.priorHighP8Band, 'well-above');
});

test('ks4-prior-attainment: an empty group is null, not zero', async () => {
  const { rows } = await buildFromFixtures('ks4-prior-attainment');
  // St Michael's has no low prior attainers (0 pupils, "z" results)
  const r = rows('ks4-prior-attainment').get(101361);
  assert.ok(r);
  assert.equal(r.priorLowPct, null);
  assert.equal(r.priorLowAtt8, null);
  assert.equal(r.priorLowP8Band, null);
  assert.equal(r.priorHighP8Band, 'well-above'); // 0.9, interval 0.64 to 1.16
  assert.equal(r.priorMidP8, 1.63);
});

test('ks4-prior-attainment: falls back to an older year, and fully suppressed schools have no row', async () => {
  const { rows } = await buildFromFixtures('ks4-prior-attainment');
  assert.equal(rows('ks4-prior-attainment').get(100055)?.priorYear, '2022/23'); // only 2022/23 rows in the fixture
  assert.equal(rows('ks4-prior-attainment').get(100055)?.priorMidAtt8, 43.7);
  assert.equal(rows('ks4-prior-attainment').has(100001), false); // every value "z"
  assert.equal(rows('ks4-prior-attainment').has(100052), false); // no prior-attainment rows at all
});

test('ks4-prior-attainment: values are in range', async () => {
  const { rows } = await buildFromFixtures('ks4-prior-attainment');
  for (const [urn, row] of rows('ks4-prior-attainment')) {
    for (const g of ['Low', 'Mid', 'High']) {
      const pct = row[`prior${g}Pct`] as number | null;
      assert.ok(pct === null || (pct >= 0 && pct <= 100), `${urn} ${g}: ${String(pct)}`);
      const lower = row[`prior${g}P8Lower`] as number | null;
      const upper = row[`prior${g}P8Upper`] as number | null;
      assert.ok(lower === null || upper === null || lower <= upper, `${urn} ${g} interval`);
    }
  }
});
