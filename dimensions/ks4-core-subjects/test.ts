import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { loadCoreSubjects, pointsToGrade } from './parse.ts';

// The KS4 file belongs to ks4-headline, so that is where its fixture lives
const fixture = new URL('../ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('points over two slots become a grade; zero and missing are null', () => {
  assert.equal(pointsToGrade(10.8), 5.4);
  assert.equal(pointsToGrade(0), null); // no counted results (e.g. IGCSEs)
  assert.equal(pointsToGrade(null), null);
});

test('core subjects parser: halves the Total row points, and suppression codes become null', async () => {
  const cs = await loadCoreSubjects(fixture);
  // Haverstock: source has 9.3 English points and 8.2 maths points
  assert.deepEqual(cs.get(100049)!.get('2024/25'), { englishGrade: 4.65, mathsGrade: 4.1 });
  assert.deepEqual(cs.get(109694)!.get('2024/25'), { englishGrade: null, mathsGrade: null }); // "z"
  assert.deepEqual(cs.get(100001)!.get('2024/25'), { englishGrade: 8.35, mathsGrade: null }); // independent: maths is 0
});

test('ks4-core-subjects: a school gets the grades for the headline year', async () => {
  const { rows } = await buildFromFixtures('ks4-core-subjects');
  const r = rows('ks4-core-subjects').get(100049);
  assert.ok(r);
  assert.equal(r.coreSubjectsYear, '2024/25');
  assert.ok(Math.abs((r.englishGrade as number) - 4.65) <= 0.05);
  assert.equal(r.mathsGrade, 4.1);
  assert.equal(rows('ks4-core-subjects').get(100001)?.mathsGrade, null);
});

test('ks4-core-subjects: suppressed schools have no row; grades are within 1-9', async () => {
  const { rows } = await buildFromFixtures('ks4-core-subjects');
  const all = rows('ks4-core-subjects');
  assert.equal(all.has(109694), false);
  assert.equal(all.has(999999), false);
  for (const [urn, r] of all) {
    for (const g of [r.englishGrade as number | null, r.mathsGrade as number | null]) {
      assert.ok(g === null || (g > 0 && g <= 9), `${urn}: ${String(g)}`);
    }
  }
});
