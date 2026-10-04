import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import type { School } from '../../web/toolkit.ts';
import { isBoarding, loadBoarding } from './parse.ts';
import { filters, popupTags } from './web.ts';

// The GIAS file belongs to gias-core, so that is where its fixture lives
const fixture = new URL('../gias-core/fixtures/gias.csv', import.meta.url).pathname;

test('isBoarding: only "Boarding school" counts', () => {
  assert.equal(isBoarding('Boarding school'), true);
  for (const no of [null, '', 'No boarders', 'Not applicable', "Children's home (Boarding school)"]) assert.equal(isBoarding(no), false);
});

test('boarding parser: reads the fixture', async () => {
  const found = await loadBoarding(fixture);
  assert.equal(found.has(100001), true);
  assert.equal(found.has(100049), false); // no boarders
  assert.equal(found.has(100052), false); // blank
});

test('boarding: rows only for boarding schools', async () => {
  const { rows } = await buildFromFixtures('boarding');
  const all = rows('boarding');
  assert.equal(all.get(100001)?.boarding, true);
  assert.equal(all.has(100049), false);
});

const school = (boarding: boolean) => ({ boarding }) as School;

test('filter: off keeps everything, on keeps boarding schools', () => {
  const f = filters[0] as Extract<(typeof filters)[number], { control: { kind: 'checkbox' } }>;
  assert.equal(f.test(school(false), false), true);
  assert.equal(f.test(school(false), true), false);
  assert.equal(f.test(school(true), true), true);
});

test('popup tag: Boarding only for boarding schools', () => {
  assert.deepEqual(popupTags[0].tag(school(true)), { text: 'Boarding' });
  assert.equal(popupTags[0].tag(school(false)), null);
});
