import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type ChipFilter, type School } from '../../web/toolkit.ts';
import { loadTrusts } from './parse.ts';
import { filters, popupSections } from './web.ts';

// The GIAS file belongs to gias-core, so that is where its fixture lives
const fixture = new URL('../gias-core/fixtures/gias.csv', import.meta.url).pathname;

test('trust parser: code and name, and nothing for schools outside a trust', async () => {
  const trusts = await loadTrusts(fixture);
  assert.deepEqual(trusts.get(135315), { id: '8888', name: 'ARK SCHOOLS' });
  assert.deepEqual(trusts.get(136091), { id: '8888', name: 'ARK SCHOOLS' });
  assert.equal(trusts.has(100049), false); // maintained school, no trust
});

test('trust: id on every member, and the count of mapped schools', async () => {
  const { rows } = await buildFromFixtures('trust');
  const all = rows('trust');
  assert.equal(all.get(135315)?.trustId, '8888');
  assert.equal(all.get(135315)?.trustSchools, 2);
  assert.equal(all.get(136091)?.trustSchools, 2);
  assert.equal(all.get(108640)?.trustSchools, 1);
  assert.equal(all.has(100049), false);
  assert.equal(all.has(128340), false); // closed school: not on the map, so not counted
});

const school = (o: Partial<School>) => ({ trust: null, trustId: null, trustSchools: null, att8Pct: null, p8: null, ofstedSummary: null, ...o }) as School;

test('filter: keeps only the chosen trust', () => {
  const f = filters[0] as ChipFilter;
  assert.equal(f.test(school({ trustId: '8888' }), '8888'), true);
  assert.equal(f.test(school({ trustId: '1' }), '8888'), false);
  assert.equal(f.test(school({}), '8888'), false);
  assert.equal(f.test(school({}), ''), true); // off: keeps everything
});

test('summary: medians and Ofsted counts, skipping missing values', () => {
  const f = filters[0];
  if (f.control.kind !== 'chip') throw new Error('expected a chip filter');
  const schools = [
    school({ trust: 'T', att8Pct: 20, p8: -0.5, ofstedSummary: 'good' }),
    school({ trust: 'T', att8Pct: 60, p8: 0.1, ofstedSummary: 'good' }),
    school({ trust: 'T', att8Pct: 90, p8: null, ofstedSummary: 'top' }),
    school({ trust: 'T' }),
  ];
  assert.equal(f.control.chipText(schools, '1'), 'T');
  const html = f.control.summary!(schools, '1', h)!.value;
  assert.match(html, /60th percentile \(3 of 4 schools\)/);
  assert.match(html, /−0\.20 \(2 of 4 schools\)/); // median of -0.5 and 0.1
  assert.match(html, /Ofsted: Outstanding<\/th><td>1</);
  assert.match(html, /Ofsted: Good<\/th><td>2</);
  assert.match(html, /no recent inspection<\/th><td>1</);
  assert.doesNotMatch(html, /Serious concern/);
  assert.match(html, /joined the trust after/);
});

test('trust primary phase: counts the primaries in the trust, and the chip has no secondary results rows', async () => {
  const { rows } = await buildFromFixtures('trust', 'primary');
  const all = rows('trust');
  assert.equal(all.get(900003)?.trustId, '17001');
  assert.equal(all.get(900003)?.trustSchools, 1);
  assert.equal(all.has(135315), false); // a secondary academy
  const f = filters[1];
  if (f.control.kind !== 'chip') throw new Error('expected a chip filter');
  const html = f.control.summary!([school({ trust: 'T', ofstedSummary: 'good' }), school({ trust: 'T' })], '1', h)!.value;
  assert.match(html, /Ofsted: Good<\/th><td>1</);
  assert.doesNotMatch(html, /percentile|Progress 8/);
});

test('popup button: only when the trust has other schools, and the id is escaped', () => {
  const render = popupSections[0].render;
  assert.equal(render(school({ trustId: '1', trustSchools: 1 }), h, () => []), null);
  assert.equal(render(school({}), h, () => []), null);
  const html = render(school({ trustId: '1"><b>', trustSchools: 14 }), h, () => [])!.value;
  assert.match(html, /See all 14 schools in this trust/);
  assert.doesNotMatch(html, /<b>/);
});
