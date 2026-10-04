import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { p8Band } from './bands.ts';
import { loadKs4, yearLabel } from './parse.ts';

const fixture = new URL('./fixtures/ks4.csv', import.meta.url).pathname;

test('p8Band follows the DfE rules', () => {
  assert.equal(p8Band(0.6, 0.4, 0.8), 'well-above');
  assert.equal(p8Band(0.3, 0.1, 0.5), 'above');
  assert.equal(p8Band(-0.2, -0.44, 0.04), 'average');
  assert.equal(p8Band(-0.3, -0.5, -0.1), 'below');
  assert.equal(p8Band(-0.6, -0.8, -0.4), 'well-below');
});

test('yearLabel', () => assert.equal(yearLabel('202425'), '2024/25'));

test('ks4 parser: values by year, and suppression codes become null', async () => {
  const ks4 = await loadKs4(fixture);
  const haverstock = ks4.get(100049)!;
  assert.deepEqual([...haverstock.years.keys()].sort(), ['2022/23', '2023/24', '2024/25']);
  const latest = haverstock.years.get('2024/25')!;
  assert.equal(latest.cohort, 146);
  assert.equal(latest.att8, 41.5);
  assert.equal(latest.att8Disadvantaged, 39.8);
  assert.equal(latest.disadvantagedPct, 80.1);
  assert.equal(latest.p8, null); // "z": Progress 8 not published for 2024/25
  assert.equal(haverstock.years.get('2023/24')!.p8, -0.2);
  // Edward Peake has a row but every measure is "z"
  const empty = ks4.get(109694)!.years.get('2024/25')!;
  assert.equal(empty.att8, null);
  assert.equal(empty.disadvantagedPct, null);
});

test('ks4-headline: a known school', async () => {
  const { rows } = await buildFromFixtures('ks4-headline');
  const r = rows('ks4-headline').get(100049);
  assert.ok(r);
  assert.equal(r.ks4Year, '2024/25');
  assert.equal(r.att8, 41.5);
  assert.equal(r.att8Prev, 44.2);
  assert.equal(r.att8Prev2, 41.7);
  assert.equal(r.att8Years, 3);
  assert.equal(r.p8Year, '2023/24'); // latest year with a complete Progress 8 and interval
  assert.equal(r.p8, -0.2);
  assert.equal(r.p8Band, 'average');
  assert.equal(rows('ks4-headline').get(101361)?.p8Band, 'well-above');
});

test('ks4-headline: a school with only suppressed results has null results, not zeros', async () => {
  const { rows } = await buildFromFixtures('ks4-headline');
  const r = rows('ks4-headline').get(109694);
  assert.ok(r);
  assert.equal(r.att8, null);
  assert.equal(r.att8Pct, null);
  assert.equal(r.p8, null);
  assert.equal(r.p8Band, null);
  assert.equal(r.att8Years, 0);
});

test('ks4-headline: percentiles are for state schools only, within 0-100', async () => {
  const { rows } = await buildFromFixtures('ks4-headline');
  const gias = rows('gias-core');
  for (const [urn, r] of rows('ks4-headline')) {
    const pct = r.att8Pct as number | null;
    if (gias.get(urn)?.sector === 'independent') assert.equal(pct, null, `${urn} is independent`);
    else assert.ok(pct === null || (pct >= 0 && pct <= 100), `${urn} percentile ${String(pct)}`);
  }
});

test('ks4-headline: history has a row per school and year', async () => {
  const { extra } = await buildFromFixtures('ks4-headline');
  const mine = extra('ks4-headline', 'history').filter((h) => h.urn === 100049);
  assert.equal(mine.length, 3);
  assert.equal(mine.find((h) => h.year === '2023/24')?.att8, 44.2);
});
