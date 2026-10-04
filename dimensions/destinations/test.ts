import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { loadDestinations } from './parse.ts';
import { popupSections } from './web.ts';

const fixture = new URL('./fixtures/destinations.csv', import.meta.url).pathname;

test('destinations parser: latest year, all-pupils percentage rows, values as published', async () => {
  const d = await loadDestinations(fixture);
  // Haverstock School, 2022/23 leavers (the disadvantaged rows and earlier years differ)
  assert.deepEqual(d.get(100049), {
    year: '2022/23',
    cohort: 151,
    sustained: 92.7,
    schoolSixth: 76.2,
    sixthCollege: 1.3,
    fe: 13.9,
    apprenticeship: 0,
    work: 1.3,
    notSustained: 4,
  });
});

test('destinations parser: special schools are left out and a suppressed value (c) is null', async () => {
  const d = await loadDestinations(fixture);
  assert.equal(d.has(100091), false);
  const r = d.get(108058)!;
  assert.equal(r.sixthCollege, null);
  assert.equal(r.apprenticeship, null);
  assert.ok(typeof r.sustained === 'number');
});

test('destinations: stored rows and national medians', async () => {
  const { rows, metadata } = await buildFromFixtures('destinations');
  const all = rows('destinations');
  const burnside = all.get(108640)!;
  assert.equal(burnside.destYear, '2022/23');
  assert.equal(burnside.destCohort, 131);
  assert.equal(burnside.destSustained, 90); // stored to whole percentages
  assert.equal(burnside.destSchoolSixth, 24);
  assert.equal(all.has(100001), false); // independent: no row in this source
  assert.equal(metadata.destYear, '2022/23');
  const m = metadata.destMedianSustained as number;
  assert.ok(m > 80 && m < 100, String(m));
});

const school = (p: Partial<School>) =>
  ({ destYear: null, destCohort: null, destSustained: null, destSchoolSixth: null, destSixthCollege: null, destFe: null, destApprenticeship: null, destWork: null, destNotSustained: null, ...p }) as School;

test('popup: headline and table with typical values, suppressed rows hidden, hidden without data', () => {
  const s = popupSections[0];
  const meta = { destMedianSchoolSixth: 40, destMedianFe: 20, destMedianSustained: 93 } as unknown as Metadata;
  const html = String(s.render(school({ destSustained: 91, destSchoolSixth: 55, destFe: 20, destCohort: 150, destYear: '2022/23' }), h, () => [], meta));
  assert.match(html, /91%<\/strong> stayed in education/);
  assert.match(html, /School sixth form/);
  assert.match(html, /55%/);
  assert.match(html, /40%/);
  assert.match(html, /150 pupils/);
  assert.doesNotMatch(html, /Apprenticeship/);
  assert.doesNotMatch(html, /null/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
});
