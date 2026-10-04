import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { loadCurriculum } from './parse.ts';
import { filters } from './web.ts';

// The KS4 file belongs to ks4-headline, so that is where its fixture lives
const fixture = new URL('../ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('curriculum parser: Total rows by year, and suppression codes become null', async () => {
  const c = await loadCurriculum(fixture);
  assert.deepEqual(c.get(100049)!.get('2024/25'), {
    tripleSciencePct: 12.3,
    multiLanguagePct: 2.7,
    languagePct: 27.4,
    humanitiesPct: 89,
    gcsesPerPupil: 6.4,
  });
  assert.equal(c.get(100049)!.get('2023/24')!.tripleSciencePct, 14.1);
  assert.deepEqual(c.get(109694)!.get('2024/25'), {
    tripleSciencePct: null,
    multiLanguagePct: null,
    languagePct: null,
    humanitiesPct: null,
    gcsesPerPupil: null,
  });
});

test('ks4-curriculum: a school gets the figures for the headline year', async () => {
  const { rows } = await buildFromFixtures('ks4-curriculum');
  const r = rows('ks4-curriculum').get(100193);
  assert.ok(r);
  assert.equal(r.curriculumYear, '2024/25');
  assert.equal(r.tripleSciencePct, 31);
  assert.equal(r.gcsesPerPupil, 8.5);
});

test('ks4-curriculum: suppressed and missing rows have no row; invariants hold', async () => {
  const { rows } = await buildFromFixtures('ks4-curriculum');
  const all = rows('ks4-curriculum');
  assert.equal(all.has(109694), false); // every figure suppressed
  assert.equal(all.has(100050), true); // present in the source
  for (const [urn, r] of all) {
    for (const k of ['tripleSciencePct', 'languagePct', 'multiLanguagePct', 'humanitiesPct'] as const) {
      const v = r[k] as number | null;
      assert.ok(v === null || (v >= 0 && v <= 100), `${urn} ${k}: ${String(v)}`);
    }
    const [one, many] = [r.languagePct as number | null, r.multiLanguagePct as number | null];
    if (one !== null && many !== null) assert.ok(many <= one, `${urn}: more than one language ${many} > any language ${one}`);
  }
});

test('triple science filter: off keeps everyone; on needs at least half, and a figure', () => {
  const test = filters[0].test as (p: never, on: boolean) => boolean;
  const school = (v: number | null) => ({ tripleSciencePct: v }) as never;
  assert.equal(test(school(null), false), true);
  assert.equal(test(school(49.9), true), false);
  assert.equal(test(school(50), true), true);
  assert.equal(test(school(null), true), false);
});
