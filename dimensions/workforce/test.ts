import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { loadSickness, loadWorkforce } from './parse.ts';
import { popupSections } from './web.ts';

const dir = new URL('./fixtures/', import.meta.url).pathname;

test('workforce parser: figures as published, suppressed (x) rows are skipped', async () => {
  const w = await loadWorkforce(`${dir}workforce.csv`);
  // Burnside College: 63.4 FTE teachers, 66 teachers, 2 FTE without QTS, 15.2% part time
  assert.deepEqual(w.get(108640), { year: '2025/26', teachersFte: 63.4, teachersHc: 66, withoutQtsFte: 2, partTimePct: 15.2 });
  assert.equal(w.get(145609), undefined);
});

test('sickness parser: figures as published, suppressed (c) rows are skipped', async () => {
  const s = await loadSickness(`${dir}workforce-sickness.csv`);
  assert.deepEqual(s.get(108640), { year: '2024/25', daysPerTeacher: 4.4, takingAbsencePct: 53.8 });
  assert.equal(s.get(100091), undefined);
});

test('workforce: values and our own pupil-teacher ratio on the stored rows', async () => {
  const { rows, metadata } = await buildFromFixtures('workforce');
  const all = rows('workforce');
  const r = all.get(108640)!;
  assert.equal(r.workforceYear, '2025/26');
  assert.equal(r.teachersFte, 63.4);
  assert.equal(r.teachersHeadcount, 66);
  assert.equal(r.pupilTeacherRatio, 15.7); // census 995 pupils / 63.4
  assert.equal(r.unqualifiedTeachersPct, 3.2); // 2 / 63.4
  assert.equal(r.partTimeTeachersPct, 15);
  assert.equal(r.sicknessYear, '2024/25');
  assert.equal(r.teacherSicknessDays, 4.4);
  assert.equal(r.teachersTakingAbsencePct, 54);
  assert.equal(all.get(100049)?.pupilTeacherRatio, 14.2); // 878 / 61.99
  assert.equal(all.has(100001), false); // independent school: not in the state workforce files
  for (const [urn, row] of all) {
    const ptr = row.pupilTeacherRatio as number | null;
    assert.ok(ptr === null || (ptr > 3 && ptr < 40), `${urn}: ${String(ptr)}`);
    const q = row.unqualifiedTeachersPct as number | null;
    assert.ok(q === null || (q >= 0 && q <= 100), `${urn}: ${String(q)}`);
  }
  assert.equal(metadata.workforceYear, '2025/26');
  assert.equal(metadata.sicknessYear, '2024/25');
  const m = metadata.workforceMedianPupilTeacherRatio as number;
  assert.ok(m > 10 && m < 25, String(m));
});

const school = (p: Partial<School>) =>
  ({ workforceYear: null, teachersFte: null, pupilTeacherRatio: null, unqualifiedTeachersPct: null, partTimeTeachersPct: null, sicknessYear: null, teacherSicknessDays: null, teachersTakingAbsencePct: null, ...p }) as School;

test('popup: shows school and typical figures, hides missing rows, and is hidden without data', () => {
  const s = popupSections[0];
  const meta = { workforceMedianTeachersFte: 70, workforceMedianPupilTeacherRatio: 17.1, workforceMedianSicknessDays: 5.3 } as unknown as Metadata;
  const title = typeof s.title === 'function' ? s.title(school({ workforceYear: '2025/26' })) : s.title;
  assert.equal(title, 'Staff (2025/26)');
  const html = String(s.render(school({ teachersFte: 62, pupilTeacherRatio: 16.8, teacherSicknessDays: 4.1, sicknessYear: '2024/25', workforceYear: '2025/26' }), h, () => [], meta));
  assert.match(html, /62\.0/);
  assert.match(html, /16\.8/);
  assert.match(html, /17\.1/);
  assert.match(html, /Sickness absence is for 2024\/25/);
  assert.doesNotMatch(html, /<th>Teachers without/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
});

test('workforce: primary phase has its own rows and secondary schools are absent', async () => {
  const { rows } = await buildFromFixtures('workforce', 'primary');
  const all = rows('workforce');
  assert.ok(all.has(900001));
  assert.equal(all.has(100050), false);
});
