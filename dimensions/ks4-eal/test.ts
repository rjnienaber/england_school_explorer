import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { loadEal } from './parse.ts';

// The KS4 file belongs to ks4-headline, so that is where its fixture lives
const fixture = new URL('../ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('eal parser: groups by year, and suppression codes become null', async () => {
  const eal = await loadEal(fixture);
  assert.deepEqual(eal.get(100049)!.get('2024/25'), { count: 90, percent: 61.6, att8: 42.5 });
  assert.deepEqual(eal.get(100049)!.get('2023/24'), { count: 85, percent: 60, att8: 40.1 });
  assert.deepEqual(eal.get(109319)!.get('2024/25'), { count: null, percent: null, att8: null });
});

test('ks4-eal: a school gets the share and average for the headline year', async () => {
  const { rows } = await buildFromFixtures('ks4-eal');
  const r = rows('ks4-eal').get(100049);
  assert.ok(r);
  assert.equal(r.ealYear, '2024/25');
  assert.equal(r.ealPct, 61.6);
  assert.equal(r.att8Eal, 42.5);
  assert.equal(rows('ks4-eal').get(108058)?.att8Eal, 51.3);
});

test('ks4-eal: fewer than 10 pupils, suppressed rows and missing rows have no row', async () => {
  const { rows } = await buildFromFixtures('ks4-eal');
  const r = rows('ks4-eal');
  assert.equal(r.has(100052), false); // 6 pupils
  assert.equal(r.has(109319), false); // suppressed
  assert.equal(r.has(100193), false); // no row
});
