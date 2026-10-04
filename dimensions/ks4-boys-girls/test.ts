import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { loadSexResults } from './parse.ts';

// The KS4 file belongs to ks4-headline, so that is where its fixture lives
const fixture = new URL('../ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('sex parser: groups by year, and suppression codes become null', async () => {
  const bySex = await loadSexResults(fixture);
  assert.deepEqual(bySex.get(100049)!.get('2024/25'), { Boys: { att8: 39.1, count: 72 }, Girls: { att8: 43.8, count: 74 } });
  assert.deepEqual(bySex.get(108058)!.get('2024/25')!.Girls, { att8: 50.1, count: 154 });
  assert.deepEqual(bySex.get(109319)!.get('2024/25')!.Boys, { att8: null, count: null });
  assert.equal(bySex.get(100049)!.get('2023/24'), undefined);
});

test('ks4-boys-girls: a mixed school gets both averages and counts', async () => {
  const { rows } = await buildFromFixtures('ks4-boys-girls');
  const r = rows('ks4-boys-girls').get(100049);
  assert.ok(r);
  assert.equal(r.sexYear, '2024/25');
  assert.equal(r.att8Boys, 39.1);
  assert.equal(r.att8Girls, 43.8);
  assert.equal(r.boysCount, 72);
  assert.equal(r.girlsCount, 74);
});

test('ks4-boys-girls: uses the headline year, not an older one', async () => {
  const { rows } = await buildFromFixtures('ks4-boys-girls');
  assert.equal(rows('ks4-boys-girls').get(108058)?.sexYear, '2024/25');
  assert.equal(rows('ks4-boys-girls').get(108058)?.att8Boys, 46.2);
});

test('ks4-boys-girls: single-sex schools, small groups and suppressed groups have no row', async () => {
  const { rows } = await buildFromFixtures('ks4-boys-girls');
  const r = rows('ks4-boys-girls');
  assert.equal(r.has(100193), false); // girls' school
  assert.equal(r.has(100052), false); // only 4 girls
  assert.equal(r.has(109319), false); // boys suppressed
  assert.equal(r.has(100055), false); // mixed, but no sex rows
});
