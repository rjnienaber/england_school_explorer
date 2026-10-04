import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type School } from '../../web/toolkit.ts';
import { fifthOf } from './bands.ts';
import { loadIdaci, loadLsoaCodes } from './parse.ts';
import { filters, popupSections } from './web.ts';

const iod = new URL('./fixtures/iod2025.csv', import.meta.url).pathname;
// The GIAS file belongs to gias-core, so that is where its fixture lives
const gias = new URL('../gias-core/fixtures/gias.csv', import.meta.url).pathname;

test('IDACI parser: decile as given, score turned into a percentage', async () => {
  const found = await loadIdaci(iod);
  // City of London 001A: IDACI rate 0.039, decile 10
  assert.deepEqual(found.get('E01000001'), { decile: 10, scorePct: 3.9 });
  assert.equal(found.size, 10);
});

test('LSOA parser: codes by URN, blank skipped', async () => {
  const codes = await loadLsoaCodes(gias);
  assert.equal(codes.get(100049), 'E01000006');
  assert.equal(codes.has(108058), false); // blank
});

test('deprivation: decile and score on the stored rows; schools without an England match get none', async () => {
  const { rows } = await buildFromFixtures('deprivation');
  const all = rows('deprivation');
  const r = all.get(100001)!;
  assert.equal(typeof r.idaciDecile, 'number');
  assert.ok((r.idaciScorePct as number) > 0 && (r.idaciScorePct as number) < 100);
  assert.equal(all.has(108058), false); // no LSOA code
  assert.equal(all.has(116430), false); // Welsh LSOA, not in the English index
});

const school = (idaciDecile: number | null, idaciScorePct: number | null = null) => ({ idaciDecile, idaciScorePct }) as School;

test('fifths: deciles 1-2 are the most deprived fifth, 9-10 the least', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(fifthOf), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('filter: each fifth keeps its two deciles; no data shows only under Any', () => {
  const f = filters[0] as Extract<(typeof filters)[number], { control: { kind: 'select' } }>;
  assert.equal(f.control.options.length, 6);
  assert.equal(f.test(school(null), ''), true);
  assert.equal(f.test(school(null), '1'), false);
  assert.deepEqual([1, 2, 3, 4].map((d) => f.test(school(d), '1')), [true, true, false, false]);
  assert.deepEqual([9, 10, 8].map((d) => f.test(school(d), '5')), [true, true, false]);
});

test('popup: wording by fifth, nothing without a decile', () => {
  const s = popupSections[0];
  assert.match(String(s.render(school(3, 31.46), h, () => [])), /2nd most deprived fifth of England \(decile 3 of 10\)/);
  assert.doesNotMatch(String(s.render(school(3, 31.46), h, () => [])), /31\.5/);
  assert.equal(s.render(school(null), h, () => []), null);
});
