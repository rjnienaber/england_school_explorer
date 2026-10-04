import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { loadAbsence } from './parse.ts';
import { modes, popupSections } from './web.ts';

const fixture = new URL('./fixtures/absence.csv', import.meta.url).pathname;

test('absence parser: latest year only, secondary and primary rows, values as published', async () => {
  const a = await loadAbsence(fixture);
  // 2024/25 row of Haverstock School
  assert.deepEqual(a.get(100049), { year: '2024/25', pupils: 678, overallPct: 13.253, unauthorisedPct: 8.38882, persistentPct: 42.62537, severePct: 7.22714 });
  assert.equal(a.get(100091), undefined); // a special school row, not a secondary
});

test('absence parser: a suppressed value (x) is null and the other figures survive', async () => {
  // The 2024/25 severe absence of Edward Peake is "x" in the fixture (edited by hand: the real file has no suppression here)
  const r = (await loadAbsence(fixture)).get(109694)!;
  assert.equal(r.severePct, null);
  assert.equal(r.overallPct, 6.98591);
});

test('absence: values, percentile direction and national medians on the stored rows', async () => {
  const { rows, metadata } = await buildFromFixtures('absence');
  const all = rows('absence');
  const haverstock = all.get(100049)!;
  assert.equal(haverstock.absenceYear, '2024/25');
  assert.equal(haverstock.absencePupils, 678);
  assert.equal(haverstock.absencePersistentPct, 42.6);
  assert.equal(haverstock.absenceOverallPct, 13.3);
  // Lower absence is better: Stepney (9.7%) ranks above Haverstock (42.6%)
  assert.ok((all.get(100977)!.absencePersistentPctile as number) > (haverstock.absencePersistentPctile as number));
  assert.equal(all.has(100001), false); // independent: no row in this source
  assert.equal(all.has(100091), false); // special school
  assert.equal(all.get(109694)!.absenceSeverePct, null);
  assert.equal(metadata.absenceYear, '2024/25');
  const m = metadata.absenceMedianPersistentPct as number;
  assert.ok(m > 16 && m < 50, String(m));
});

const school = (p: Partial<School>) =>
  ({ absencePersistentPct: null, absencePersistentPctile: null, absenceOverallPct: null, absenceSeverePct: null, absencePupils: null, absenceYear: null, ...p }) as School;

test('mode: lowest absence is the best bucket; no data is null', () => {
  const m = modes[0];
  assert.equal(m.bucketOf(school({ absencePersistentPctile: 95 })), 0);
  assert.equal(m.bucketOf(school({ absencePersistentPctile: 3 })), 4);
  assert.equal(m.bucketOf(school({})), null);
  assert.equal(m.formatValue(school({})), '–');
});

test('popup: shows the school and national figures, and is hidden without data', () => {
  const s = popupSections[0];
  const meta = { absenceMedianOverallPct: 8.7, absenceMedianPersistentPct: 24.1, absenceMedianSeverePct: 3.2 } as unknown as Metadata;
  const html = String(s.render(school({ absenceOverallPct: 13.3, absencePersistentPct: 42.6, absenceSeverePct: 7.2, absencePupils: 678 }), h, () => [], meta));
  assert.match(html, /13\.3%/);
  assert.match(html, /24\.1%/);
  assert.match(html, /678 pupils/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
  // Without metadata (as when the build traces fields) it still renders, minus the national column
  assert.doesNotMatch(String(s.render(school({ absenceOverallPct: 13.3 }), h, () => [])), /24\.1/);
});

test('absence: primary phase has its own rows, medians and secondary schools are absent', async () => {
  const { rows, metadata } = await buildFromFixtures('absence', 'primary');
  const all = rows('absence');
  assert.equal(all.get(900001)!.absencePupils, 212);
  assert.equal(all.get(900001)!.absenceOverallPct, 5.1);
  assert.equal(all.has(100049), false);
  assert.equal(metadata.absenceYear, '2024/25');
});
