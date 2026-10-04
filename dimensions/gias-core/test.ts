import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleRows, skipWithoutStore } from '../../lib/test-store.ts';
import { module } from './build.ts';

test('gias-core: schools in scope and a known school', skipWithoutStore, () => {
  const rows = moduleRows('gias-core', module.fields);
  assert.ok(rows.size >= 3500, `only ${rows.size} schools`);
  assert.ok(rows.size < 5000);
  const haverstock = rows.get(100049);
  assert.ok(haverstock);
  assert.equal(haverstock.name, 'Haverstock School');
  assert.equal(haverstock.la, 'Camden');
  assert.equal(haverstock.sector, 'state');
  assert.equal(haverstock.sixthForm, true);
  assert.equal(haverstock.selective, false);
  assert.equal(haverstock.ageLow, 11);
});

test('gias-core: every school has a sector and a name', skipWithoutStore, () => {
  for (const [urn, r] of moduleRows('gias-core', module.fields)) {
    assert.ok(r.sector === 'state' || r.sector === 'independent', `${urn} sector ${String(r.sector)}`);
    assert.ok(typeof r.name === 'string' && r.name.length > 0, `${urn} has no name`);
  }
});
