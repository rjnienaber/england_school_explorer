import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h } from '../../web/toolkit.ts';
import { progressBand } from './bands.ts';
import { loadKs2 } from './parse.ts';
import { KS2_COLUMNS, KS2_INFO_COLUMNS } from './source.ts';
import { modes, popupSections } from './web.ts';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

test('progressBand: most of the subjects must be clearly above or below, and none the other way', () => {
  const s = (score: number, lower: number, upper: number) => ({ score, lower, upper });
  assert.equal(progressBand([s(3, 1, 5), s(2.5, 0.5, 4.5), s(4, 1.2, 6.8)]), 'above');
  assert.equal(progressBand([s(3, 1, 5), s(0.5, -2, 3), s(0.2, -2, 2.4)]), 'average'); // one in three is not enough
  assert.equal(progressBand([s(3, 1, 5), s(-3, -5, -1), s(0, -2, 2)]), 'average'); // a split
  assert.equal(progressBand([s(-3, -5, -1), s(-2.5, -4.5, -0.5), s(-1, -3, 1)]), 'below');
  assert.equal(progressBand([s(2, 0.2, 3.8), { score: null, lower: null, upper: null }, { score: null, lower: null, upper: null }]), 'above'); // one published subject
  assert.equal(progressBand([{ score: null, lower: null, upper: null }]), null);
});

test('ks2 parser: values by year, suppression codes become null, cohorts from the information file', async () => {
  const ks2 = await loadKs2(fixture('ks2.csv'), fixture('ks2-info.csv'));
  const s = ks2.get(900001)!;
  assert.deepEqual([...s.years.keys()].sort(), ['2022/23', '2023/24', '2024/25']);
  const latest = s.years.get('2024/25')!;
  assert.equal(latest.rwmExpected, 71);
  assert.equal(latest.subjects.Reading.score, 106);
  assert.equal(latest.subjects.Writing.score, null); // "z": writing has no score
  assert.equal(latest.subjects.Maths.progress, null); // not published for 2024/25
  assert.equal(s.years.get('2022/23')!.subjects.Reading.progressLower, -3.5);
  assert.deepEqual(s.average, { year: '2024/25', expected: 66, higher: 9 });
  // 18 this year, 22 the year before and 55 over three years leaves 15 for the earliest
  assert.deepEqual([latest.cohort, s.years.get('2023/24')!.cohort, s.years.get('2022/23')!.cohort, s.cohort3yr], [18, 22, 15, 55]);
  // a school with a suppressed cohort has none, and its 2023/24 "c" results are null
  const small = ks2.get(900007)!;
  assert.equal(small.years.get('2024/25')!.cohort, 12);
  assert.equal(small.years.get('2023/24')!.cohort, null);
  assert.equal(small.years.get('2023/24')!.rwmHigher, null);
});

test('ks2-results: a known school', async () => {
  const { rows } = await buildFromFixtures('ks2-results');
  const r = rows('ks2-results').get(900001);
  assert.ok(r);
  assert.equal(r.ks2Year, '2024/25');
  assert.equal(r.ks2RwmExpected, 71);
  assert.equal(r.ks2RwmHigher, 12);
  assert.equal(r.ks2Cohort, 18);
  assert.equal(r.ks2RwmExpectedPrev, 64);
  assert.equal(r.ks2RwmExpectedPrev2, 60);
  assert.equal(r.ks2CohortPrev2, 15);
  assert.equal(r.ks2RwmExpectedAvg, 66);
  assert.equal(r.ks2ReadExpected, 75);
  assert.equal(r.ks2MathsScore, 105);
  assert.equal(r.ks2ProgressYear, '2022/23'); // the newest year with a progress score, older than the results
  assert.equal(r.ks2ReadProgress, -1.2);
  assert.equal(r.ks2ProgressBand, 'average');
  assert.equal(r.ks2ProgressMean, 0.5);
  assert.equal(rows('ks2-results').get(900003)?.ks2ProgressBand, 'above');
});

test('ks2-results: a school with a suppressed cohort and 2023/24 results has nulls, not zeros, and no progress', async () => {
  const { rows } = await buildFromFixtures('ks2-results');
  const r = rows('ks2-results').get(900007);
  assert.ok(r);
  assert.equal(r.ks2Year, '2024/25');
  assert.equal(r.ks2RwmHigherPrev, null); // "c" is null, not zero
  assert.equal(r.ks2ProgressBand, null);
  assert.equal(r.ks2ProgressYear, null);
});

test('ks2-results: percentiles are within 0-100 and the medians are metadata', async () => {
  const { rows, metadata } = await buildFromFixtures('ks2-results');
  for (const [urn, r] of rows('ks2-results')) {
    const pct = r.ks2RwmExpectedPct as number | null;
    assert.ok(pct === null || (pct >= 0 && pct <= 100), `${urn} percentile ${String(pct)}`);
  }
  assert.equal(typeof metadata.ks2MedianRwmExpected, 'number');
  assert.deepEqual(metadata.ks2Years, ['2024/25', '2023/24', '2022/23']);
});

test('ks2 source: the parsers read only columns the download stores, and the fixtures have the same shape', () => {
  for (const [file, columns] of [['ks2.csv', KS2_COLUMNS], ['ks2-info.csv', KS2_INFO_COLUMNS]] as const) {
    assert.deepEqual(readFileSync(fixture(file), 'utf-8').split('\n')[0].split(','), columns);
  }
  const code = readFileSync(new URL('./parse.ts', import.meta.url), 'utf-8');
  const read = new Set([...code.matchAll(/\brow\.([a-z0-9_]+)/g)].map((m) => m[1]));
  const stored = new Set([...KS2_COLUMNS, ...KS2_INFO_COLUMNS]);
  assert.deepEqual([...read].filter((c) => !stored.has(c)), []);
});

test('ks2 popup: shows cohort size and a small-group warning, and hides what is missing', async () => {
  const { rows, metadata } = await buildFromFixtures('ks2-results');
  const base = { ...rows('ks2-results').get(900001)!, ks2Cohort: 18 } as never;
  const ks2 = popupSections.find((s) => s.id === 'ks2')!;
  const out = ks2.render(base, h, () => [], metadata as never)!.toString();
  assert.match(out, /Only 18 pupils took the tests/);
  assert.match(out, /3-year average/);
  assert.doesNotMatch(out, /null|undefined/);
  const big = ks2.render({ ...(base as object), ks2Cohort: 60 } as never, h, () => [], metadata as never)!.toString();
  assert.doesNotMatch(big, /Only 60/);
  const progress = popupSections.find((s) => s.id === 'ks2-progress')!;
  assert.equal(progress.render({ ...(base as object), ks2ProgressBand: null } as never, h, () => [], metadata as never), null);
  assert.match(progress.render(base, h, () => [], metadata as never)!.toString(), /older group of pupils/);
});

test('ks2 modes: a small cohort is named in the value, not only by colour', async () => {
  const { rows } = await buildFromFixtures('ks2-results');
  const p = { ...rows('ks2-results').get(900001)!, ks2Cohort: 18 } as never;
  assert.equal(modes[0].formatValue(p), '71% · 18 pupils (small group)');
  assert.equal(modes[0].formatValue({ ...(p as object), ks2Cohort: 40 } as never), '71%');
  assert.equal(modes[0].formatValue({ ...(p as object), ks2RwmExpected: null } as never), '–');
});
