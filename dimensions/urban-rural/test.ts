import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type School } from '../../web/toolkit.ts';
import { classify, loadUrbanRural } from './parse.ts';
import { filters, popupSections } from './web.ts';

// The GIAS file belongs to gias-core, so that is where its fixture lives
const fixture = new URL('../gias-core/fixtures/gias.csv', import.meta.url).pathname;

test('classify: groups both label styles, leaves the rest unclassified', () => {
  assert.deepEqual(classify('Urban: Further from a major town or city'), { area: 'urban', detail: 'Urban: Further from a major town or city' });
  assert.equal(classify('Smaller rural: Nearer to a major town or city')?.area, 'rural');
  assert.equal(classify('Larger rural: Further from a major town or city')?.area, 'rural');
  assert.deepEqual(classify('(England/Wales) Urban major conurbation'), { area: 'urban', detail: 'Urban major conurbation' });
  assert.equal(classify('(England/Wales) Rural village in a sparse setting')?.area, 'rural');
  for (const none of [null, '', '(pseudo) Channel Islands/Isle of Man', '(Scotland) Large Urban Area']) assert.equal(classify(none), null);
});

test('urban-rural parser: reads the fixture', async () => {
  const found = await loadUrbanRural(fixture);
  assert.equal(found.get(100049)?.area, 'urban');
  assert.equal(found.get(116430)?.area, 'rural');
  assert.equal(found.has(108640), false); // pseudo code
  assert.equal(found.has(108058), false); // blank
});

test('urban-rural: values on the stored rows', async () => {
  const { rows } = await buildFromFixtures('urban-rural');
  const all = rows('urban-rural');
  assert.deepEqual({ ...all.get(100049) }, { urbanRural: 'urban', urbanRuralDetail: 'Urban: Nearer to a major town or city' });
  assert.equal(all.get(109694)?.urbanRural, 'rural');
  assert.equal(all.has(108640), false);
});

const school = (urbanRural: string | null, urbanRuralDetail: string | null = null) => ({ urbanRural, urbanRuralDetail }) as School;

test('filter: Any keeps everything, Urban and Rural keep only their own', () => {
  const f = filters[0] as Extract<(typeof filters)[number], { control: { kind: 'select' } }>;
  assert.equal(f.test(school(null), ''), true);
  assert.equal(f.test(school('rural'), 'urban'), false);
  assert.equal(f.test(school('rural'), 'rural'), true);
  assert.equal(f.test(school(null), 'rural'), false);
});

test('popup: shows the detail label, nothing without one', () => {
  const s = popupSections[0];
  assert.match(String(s.render(school('rural', 'Larger rural: Nearer to a major town or city'), h, () => [])), /Larger rural: Nearer to a major town or city/);
  assert.equal(s.render(school(null), h, () => []), null);
});
