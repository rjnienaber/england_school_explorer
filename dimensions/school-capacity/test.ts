import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type School } from '../../web/toolkit.ts';
import { loadCapacity } from './parse.ts';
import { modes, popupSections } from './web.ts';

// The GIAS file belongs to gias-core, so that is where its fixture lives
const fixture = new URL('../gias-core/fixtures/gias.csv', import.meta.url).pathname;

test('capacity parser: reads the capacity, ignores 0 and blank', async () => {
  const c = await loadCapacity(fixture);
  assert.equal(c.get(100049), 1000);
  assert.equal(c.has(109694), false); // capacity 0
  assert.equal(c.has(116430), false); // blank
});

test('school-capacity: pupils divided by capacity, rounded to a whole percent', async () => {
  const { rows } = await buildFromFixtures('school-capacity');
  const all = rows('school-capacity');
  assert.deepEqual({ ...all.get(100049) }, { capacity: 1000, fullPct: 88 }); // 878 / 1000
  assert.equal(all.get(108058)!.fullPct, 119); // 1782 / 1500: over capacity
  assert.equal(all.has(109694), false);
  assert.equal(all.has(116430), false);
});

const school = (fullPct: number | null, capacity: number | null = 1200, pupils: number | null = 1140) => ({ fullPct, capacity, pupils }) as School;

test('mode buckets: boundaries and no data', () => {
  const m = modes[0];
  const b = (f: number | null) => m.bucketOf(school(f));
  assert.deepEqual([69, 70, 84, 85, 94, 95, 105, 106].map(b), [0, 1, 1, 2, 2, 3, 3, 4]);
  assert.equal(b(null), null);
  assert.equal(m.formatValue(school(95)), '95% full');
});

test('popup: pupils, capacity and fullness; nothing without a capacity', () => {
  const s = popupSections[0];
  assert.match(String(s.render(school(95), h, () => [])), /1,140 · capacity 1,200 \(95% full\)/);
  assert.equal(s.render(school(null, null), h, () => []), null);
});
