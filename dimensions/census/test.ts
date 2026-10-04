import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { loadCensus } from './parse.ts';
import { popupSections } from './web.ts';

const fixture = new URL('./fixtures/census.csv', import.meta.url).pathname;

test('census parser: headcount and percentages as published, for the Total rows only', async () => {
  const c = await loadCensus(fixture);
  // Burnside College: 995 pupils, "FSM eligible" 39.2% (not the 21.9% taking the meal), first language other than English 12.8%
  assert.deepEqual(c.get(108640), { year: '2025/26', pupils: 995, fsmPct: 39.2, ealPct: 12.8 });
  assert.deepEqual(c.get(100049), { year: '2025/26', pupils: 878, fsmPct: 73.1, ealPct: 48.7 });
  assert.equal(c.get(100091), undefined); // special school phase: not kept
});

test('census parser: suppressed percentages (z) are null but the headcount survives', async () => {
  const r = (await loadCensus(fixture)).get(100001)!; // independent school
  assert.equal(r.pupils, 794);
  assert.equal(r.fsmPct, null);
  assert.equal(r.ealPct, null);
});

test('census: values and national medians on the stored rows', async () => {
  const { rows, metadata } = await buildFromFixtures('census');
  const all = rows('census');
  const r = all.get(131726)!;
  assert.equal(r.censusYear, '2025/26');
  assert.equal(r.censusPupils, 768);
  assert.equal(r.fsmPct, 20.6);
  assert.equal(r.ealPctAll, 12);
  assert.equal(all.has(100091), false);
  for (const [urn, row] of all) {
    for (const k of ['fsmPct', 'ealPctAll'] as const) {
      const v = row[k] as number | null;
      assert.ok(v === null || (v >= 0 && v <= 100), `${urn} ${k}: ${String(v)}`);
    }
  }
  assert.equal(metadata.censusYear, '2025/26');
  const m = metadata.censusMedianFsmPct as number;
  assert.ok(m > 10 && m < 75, String(m));
});

const school = (p: Partial<School>) => ({ censusYear: null, censusPupils: null, fsmPct: null, ealPctAll: null, ...p }) as School;

test('popup: shows school and typical figures, hides missing rows, and is hidden without data', () => {
  const s = popupSections[0];
  const meta = { censusMedianPupils: 1000, censusMedianFsmPct: 22.5, censusMedianEalPct: 9.8 } as unknown as Metadata;
  const title = typeof s.title === 'function' ? s.title(school({ censusYear: '2025/26' })) : s.title;
  assert.equal(title, 'Pupils (January 2026 census)');
  const html = String(s.render(school({ censusPupils: 1234, fsmPct: 30.5, ealPctAll: 12 }), h, () => [], meta));
  assert.match(html, /1,234/);
  assert.match(html, /30\.5%/);
  assert.match(html, /22\.5%/);
  const partial = String(s.render(school({ censusPupils: 500 }), h, () => [], meta));
  assert.doesNotMatch(partial, /<th>Free school meals/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
});

test('census: primary phase has its own rows and secondary schools are absent', async () => {
  const { rows } = await buildFromFixtures('census', 'primary');
  const all = rows('census');
  assert.ok(all.has(900001));
  assert.equal(all.has(135315), false);
});
