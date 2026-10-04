import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { loadGias } from './parse.ts';

const fixture = new URL('./fixtures/gias.csv', import.meta.url).pathname;

test('gias-core parser: a known school, with its easting/northing converted to WGS84', async () => {
  const haverstock = (await loadGias(fixture)).get(100049);
  assert.ok(haverstock);
  assert.equal(haverstock.name, 'Haverstock School');
  assert.equal(haverstock.postcode, 'NW3 2BQ');
  assert.equal(haverstock.pupils, 878);
  assert.equal(haverstock.religion, null); // "Does not apply" is a missing value, not text
  assert.ok(haverstock.lngLat);
  assert.ok(Math.abs(haverstock.lngLat[0] - -0.1532) < 0.001 && Math.abs(haverstock.lngLat[1] - 51.5448) < 0.001, String(haverstock.lngLat));
});

test('gias-core parser: closed schools are flagged and websites get a scheme', async () => {
  const gias = await loadGias(fixture);
  assert.equal(gias.get(128340)?.open, false); // The Marlowe Academy, closed
  for (const s of gias.values()) assert.ok(s.website === null || /^https?:\/\//.test(s.website), `${s.urn} ${s.website}`);
});

test('gias-core: a known school', async () => {
  const { rows } = await buildFromFixtures('gias-core');
  const haverstock = rows('gias-core').get(100049);
  assert.ok(haverstock);
  assert.equal(haverstock.name, 'Haverstock School');
  assert.equal(haverstock.la, 'Camden');
  assert.equal(haverstock.sector, 'state');
  assert.equal(haverstock.sixthForm, true);
  assert.equal(haverstock.selective, false);
  assert.equal(haverstock.ageLow, 11);
});

test('gias-core: sectors, selection and who is left out', async () => {
  const { rows, urns } = await buildFromFixtures('gias-core');
  const r = rows('gias-core');
  assert.equal(r.get(101361)?.selective, true); // a grammar school
  assert.equal(r.get(101361)?.sector, 'state');
  assert.equal(r.get(100001)?.sector, 'independent');
  // In GIAS, but with no key stage 4 results (a special school; a closed academy), so not on the map
  assert.equal(r.has(100091), false);
  assert.equal(r.has(128340), false);
  assert.equal(urns.length, 20);
  for (const [urn, row] of r) {
    assert.ok(row.sector === 'state' || row.sector === 'independent', `${urn} sector ${String(row.sector)}`);
    assert.ok(typeof row.name === 'string' && row.name.length > 0, `${urn} has no name`);
  }
});
