import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import type { School, SelectFilter } from '../../web/toolkit.ts';
import { primaryTypeOf } from './build.ts';
import { filters } from './web.ts';

test('age ranges: infant, junior, both, and unknown', () => {
  assert.equal(primaryTypeOf(4, 7), 'infant');
  assert.equal(primaryTypeOf(2, 7), 'infant');
  assert.equal(primaryTypeOf(7, 11), 'junior');
  assert.equal(primaryTypeOf(4, 11), 'all');
  assert.equal(primaryTypeOf(3, 9), 'all');
  assert.equal(primaryTypeOf(null, 11), null);
});

test('primary-type: built for the primary schools only', async () => {
  const { rows } = await buildFromFixtures('primary-type');
  const all = rows('primary-type');
  assert.equal(all.get(900001)?.primaryType, 'all');
  assert.equal(all.get(900002)?.primaryType, 'infant');
  assert.equal(all.get(900003)?.primaryType, 'junior');
  assert.equal(all.has(100049), false); // a secondary school
});

test('filter: keeps the chosen kind, or everything when off', () => {
  const f = filters[0] as SelectFilter;
  const s = (primaryType: string | null) => ({ primaryType }) as School;
  assert.equal(f.test(s('infant'), 'infant'), true);
  assert.equal(f.test(s('junior'), 'infant'), false);
  assert.equal(f.test(s(null), 'infant'), false);
  assert.equal(f.test(s(null), ''), true);
});
