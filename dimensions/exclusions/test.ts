import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { loadExclusions } from './parse.ts';
import { popupSections } from './web.ts';

const fixture = new URL('./fixtures/exclusions.csv', import.meta.url).pathname;

test('exclusions parser: latest year only, secondary rows only, values as published', async () => {
  const e = await loadExclusions(fixture);
  // 2024/25 row of Haverstock School (the 2023/24 row has 171 suspensions)
  assert.deepEqual(e.get(100049), {
    year: '2024/25',
    pupils: 909,
    suspensionRate: 24.75248,
    suspensions: 225,
    suspendedPupilsPct: 9.68097,
    permanentExclusions: 0,
    permanentExclusionRate: 0,
  });
  assert.equal(e.get(100091), undefined); // a special school row, not a secondary
});

test('exclusions parser: a suppressed rate (x) is null and the other figures survive', async () => {
  // Edward Peake's 2024/25 one-plus-suspension count and rate are "x" in the fixture (edited by hand)
  const r = (await loadExclusions(fixture)).get(109694)!;
  assert.equal(r.suspendedPupilsPct, null);
  assert.equal(r.suspensionRate, 17.80488);
  assert.equal(r.permanentExclusions, 1);
});

test('exclusions: values and national medians on the stored rows', async () => {
  const { rows, metadata } = await buildFromFixtures('exclusions');
  const all = rows('exclusions');
  const burnside = all.get(108640)!;
  assert.equal(burnside.exclusionsYear, '2024/25');
  assert.equal(burnside.exclusionsPupils, 959);
  assert.equal(burnside.suspensionRate, 24);
  assert.equal(burnside.permanentExclusions, 21);
  assert.equal(burnside.permanentExclusionRate, 2.19);
  assert.equal(all.has(100001), false); // independent: no row in this source
  assert.equal(all.has(100091), false); // special school
  assert.equal(all.get(109694)!.suspendedPupilsPct, null);
  assert.equal(metadata.exclusionsYear, '2024/25');
  const m = metadata.exclusionsMedianSuspensionRate as number;
  assert.ok(m > 5 && m < 30, String(m));
});

const school = (p: Partial<School>) =>
  ({ suspensionRate: null, suspendedPupilsPct: null, permanentExclusions: null, exclusionsPupils: null, exclusionsYear: null, ...p }) as School;

test('popup: shows school and typical figures, hides suppressed rows, and is hidden without data', () => {
  const s = popupSections[0];
  const meta = { exclusionsMedianSuspensionRate: 14.6, exclusionsMedianSuspendedPupilsPct: 6.8, exclusionsMedianPermanentExclusions: 1 } as unknown as Metadata;
  const html = String(s.render(school({ suspensionRate: 18, suspendedPupilsPct: 6, permanentExclusions: 2, exclusionsPupils: 900 }), h, () => [], meta));
  assert.match(html, /18\.0/);
  assert.match(html, /14\.6/);
  assert.match(html, /900 pupils/);
  const partial = String(s.render(school({ suspensionRate: 18, permanentExclusions: 0 }), h, () => [], meta));
  assert.doesNotMatch(partial, /Pupils suspended at least once/);
  assert.match(partial, /Permanent exclusions/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
  assert.doesNotMatch(String(s.render(school({ suspensionRate: 18 }), h, () => [])), /14\.6/);
});
