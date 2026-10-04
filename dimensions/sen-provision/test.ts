import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import type { School } from '../../web/toolkit.ts';
import { h } from '../../web/toolkit.ts';
import { needCode, needLabels } from './needs.ts';
import { loadSenProvision } from './parse.ts';
import { filters, popupSections, popupTags } from './web.ts';

// The GIAS file belongs to gias-core, so that is where its fixture lives
const fixture = new URL('../gias-core/fixtures/gias.csv', import.meta.url).pathname;

test('needs: codes are read from GIAS names; blanks and "Not Applicable" are not needs', () => {
  assert.equal(needCode('SLCN - Speech, language and Communication'), 'SLCN');
  assert.equal(needCode('Not Applicable'), null);
  assert.equal(needCode(''), null);
  assert.deepEqual(needLabels('HI,ASD'), ['Autism (ASD)', 'Hearing impairment']);
});

test('parser: kind, needs and places added together', async () => {
  const s = await loadSenProvision(fixture);
  assert.deepEqual(s.get(100049), { kind: 'resourced', needs: 'ASD', places: 16 });
  assert.deepEqual(s.get(100050), { kind: 'unit', needs: 'SLCN,HI', places: 10 });
  assert.deepEqual(s.get(100052), { kind: 'both', needs: 'ASD,MLD', places: 14 });
  assert.deepEqual(s.get(100455), { kind: 'resourced', needs: null, places: null });
  assert.equal(s.has(109694), false); // "Not applicable"
  assert.equal(s.has(100001), false);
});

test('sen-provision: rows only for in-scope schools that have provision', async () => {
  const { rows } = await buildFromFixtures('sen-provision');
  const all = rows('sen-provision');
  assert.deepEqual({ ...all.get(100052) }, { senProvision: 'both', senNeeds: 'ASD,MLD', senPlaces: 14 });
  assert.equal(all.get(100455)!.senNeeds, null);
  assert.equal(all.has(100091), false); // special school: out of scope
  assert.equal(all.has(109694), false);
});

const school = (senProvision: School['senProvision'], senNeeds: string | null, senPlaces: number | null = null) =>
  ({ senProvision, senNeeds, senPlaces }) as School;

test('filters: checkbox keeps provision schools; need select narrows them; the select depends on the checkbox', () => {
  const [box, need] = filters as [(typeof filters)[0] & { test: (p: School, v: boolean) => boolean }, (typeof filters)[1] & { test: (p: School, v: string) => boolean }];
  assert.equal(need.enabledBy, box.id);
  assert.equal(box.test(school(null, null), false), true);
  assert.equal(box.test(school(null, null), true), false);
  assert.equal(box.test(school('unit', null), true), true);
  assert.equal(need.test(school('unit', 'ASD,HI'), 'HI'), true);
  assert.equal(need.test(school('unit', 'ASD,HI'), 'VI'), false);
  assert.equal(need.test(school('unit', null), 'VI'), false);
  assert.equal(need.test(school(null, null), ''), true);
});

test('popup: tag, needs in words and places; nothing for other schools', () => {
  assert.deepEqual(popupTags[0].tag(school('unit', null)), { text: 'SEN unit' });
  assert.equal(popupTags[0].tag(school(null, null)), null);
  const html = String(popupSections[0].render(school('both', 'SLCN,HI', 14), h, () => []));
  assert.match(html, /Hearing impairment/);
  assert.match(html, /Speech, language and communication/);
  assert.match(html, /14/);
  assert.equal(popupSections[0].render(school(null, null), h, () => []), null);
});
