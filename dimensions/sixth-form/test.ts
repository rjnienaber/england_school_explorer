import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { gradeOfPoints } from './grades.ts';
import { loadSixthForm } from './parse.ts';
import { modes, popupSections } from './web.ts';

const fixture = new URL('./fixtures/ks5.csv', import.meta.url).pathname;

test('sixth form parser: latest year, A level and all students, values as published', async () => {
  const d = await loadSixthForm(fixture);
  // Haverstock School 2024/25 (the Disadvantaged, Academic and 2023/24 rows differ)
  assert.deepEqual(d.get(100049), {
    year: '2024/25',
    students: 87,
    aps: 32.52,
    grade: 'C+',
    best3Aps: 35.1,
    best3Grade: 'B-',
    aabPct: 14.3,
    va: 0.07,
    vaLower: -0.08,
    vaUpper: 0.22,
    vaBand: 'average',
    retainedPct: 89.6,
  });
  assert.equal(d.get(108640)!.vaBand, 'well-above');
  assert.equal(d.get(135897)!.vaBand, 'well-below');
});

test('sixth form parser: a suppressed value (z) is null', async () => {
  const d = await loadSixthForm(fixture);
  assert.equal(d.get(100001)!.retainedPct, null); // "z" in the source
  assert.equal(d.get(100001)!.grade, 'A');
});

test('sixth form: stored rows and typical school', async () => {
  const { rows, metadata, urns } = await buildFromFixtures('sixth-form');
  const all = rows('sixth-form');
  const r = all.get(100049)!;
  assert.equal(r.ks5Year, '2024/25');
  assert.equal(r.alevelGrade, 'C+');
  assert.equal(r.alevelAabPct, 14); // stored to whole percentages
  assert.equal(r.alevelVa, 0.07);
  assert.equal(r.alevelVaBand, 'average');
  assert.equal(r.sixthRetainedPct, 90);
  assert.ok(all.size < urns.length, 'schools with no A level row get none');
  assert.equal(metadata.ks5Year, '2024/25');
  assert.match(String(metadata.alevelMedianGrade), /^[A-E][+-]?$/);
  const aab = metadata.alevelMedianAabPct as number;
  assert.ok(aab > 0 && aab < 100, String(aab));
});

test('grade of points matches the DfE grade', () => {
  // Pairs taken from the source: aps_per_entry and aps_per_entry_grade
  for (const [points, grade] of [[32.52, 'C+'], [31.53, 'C'], [38.04, 'B-'], [41.75, 'B+'], [51.53, 'A'], [16.91, 'D-'], [46.94, 'A-'], [24.11, 'D+'], [26.37, 'C-']] as [number, string][]) {
    assert.equal(gradeOfPoints(points), grade, String(points));
  }
});

const school = (p: Partial<School>) =>
  ({ ks5Year: null, alevelStudents: null, alevelGrade: null, alevelBest3Grade: null, alevelAabPct: null, alevelVa: null, alevelVaLower: null, alevelVaUpper: null, alevelVaBand: null, sixthRetainedPct: null, sixthForm: false, ...p }) as School;

test('popup: table against typical, progress chart, hidden rows and no section without data', () => {
  const s = popupSections[0];
  const meta = { alevelMedianGrade: 'C+', alevelMedianAabPct: 10, sixthMedianRetainedPct: 90 } as unknown as Metadata;
  const html = String(
    s.render(school({ alevelGrade: 'B-', alevelAabPct: 20, alevelVa: 0.2, alevelVaLower: 0, alevelVaUpper: 0.4, alevelVaBand: 'above', alevelStudents: 80, ks5Year: '2024/25' }), h, () => [], meta),
  );
  assert.match(html, /Average A level grade/);
  assert.match(html, /B-/);
  assert.match(html, /20%/);
  assert.match(html, /Above average progress/);
  assert.match(html, /<svg/);
  assert.match(html, /80 students/);
  assert.doesNotMatch(html, /Best three/);
  assert.doesNotMatch(html, /null/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
});

test('map mode: no sixth form is its own bucket, a sixth form without a figure is No data', () => {
  const m = modes[0];
  const none = m.buckets.length - 1;
  assert.equal(m.buckets[none].label, 'No sixth form');
  assert.equal(m.bucketOf(school({ sixthForm: false })), none);
  assert.equal(m.bucketOf(school({ sixthForm: true })), null);
  assert.equal(m.bucketOf(school({ sixthForm: true, alevelVaBand: 'well-above' })), 0);
  assert.equal(m.formatValue(school({ sixthForm: false })), 'No sixth form');
});
