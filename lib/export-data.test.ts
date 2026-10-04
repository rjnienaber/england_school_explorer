import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeCell, decodeColumn, decodeUrns, encodeColumn, missingValue, shardOf, type FieldInfo, type Needs } from './columnar.ts';
import { CLIENT_CORE, checkPlacements } from './export-data.ts';

const field = (placement: FieldInfo['placement'], extra: Partial<FieldInfo> = {}): FieldInfo => ({ placement, type: 'number', ...extra });

test('columns round-trip: enums as indexes, booleans as 0/1, nulls kept', () => {
  const band: FieldInfo = { placement: 'mode', type: 'enum', lookup: ['low', 'mid', 'high'] };
  assert.deepEqual(encodeColumn(band, ['high', null, 'low']), [2, null, 0]);
  assert.deepEqual(decodeColumn(band, [2, null, 0]), ['high', null, 'low']);
  const flag: FieldInfo = { placement: 'core', type: 'boolean', default: false };
  assert.deepEqual(encodeColumn(flag, [true, false, null]), [1, 0, null]);
  assert.equal(decodeCell(flag, 1), true);
  const grade: FieldInfo = { placement: 'detail', type: 'enum', lookup: [1, 2, 3, 4] };
  assert.deepEqual(decodeColumn(grade, encodeColumn(grade, [4, 1])), [4, 1]);
  assert.throws(() => encodeColumn(band, ['nope']));
});

test('urns decode from differences; shards by remainder; defaults only for non-nullable fields', () => {
  assert.deepEqual(decodeUrns({ urnDeltas: [100000, 5, 1] }), [100000, 100005, 100006]);
  assert.equal(shardOf(100006, 64), 100006 % 64);
  assert.equal(missingValue(field('detail')), null);
  assert.equal(missingValue(field('detail', { type: 'boolean', default: false })), false);
});

const needs = (modes: Record<string, string[]>, filters: Needs['filters'] = {}): Needs => ({ modes, filters, popup: {} });
const core = Object.fromEntries(CLIENT_CORE.map((n) => [n, field('core', { type: 'string' })]));

test('a mode or filter that reads a detail field is an error naming both', () => {
  const fields = { ...core, a: field('mode'), b: field('detail') };
  const { errors } = checkPlacements(fields, needs({ m1: ['a', 'b'] }, { f1: { true: [], false: ['b'] } }), []);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /mode "m1" reads "b"/);
  assert.match(errors[1], /filter "f1" reads "b"/);
  assert.deepEqual(checkPlacements(fields, needs({ m1: ['a'] }), []).errors, []);
});

test('the fields search and the list read must be core', () => {
  const { errors } = checkPlacements({ ...core, name: field('mode', { type: 'string' }) }, needs({}), []);
  assert.match(errors.join(), /"name".*'core'/);
});

test('advice: start-up fields that are not core, core fields nothing needs, unused mode fields', () => {
  const fields = { ...core, early: field('mode'), idle: field('core'), unused: field('mode') };
  const { errors, warnings } = checkPlacements(fields, needs({ m1: ['early'] }), ['early']);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((w) => w.startsWith('"early"')));
  assert.ok(warnings.some((w) => w.startsWith('"idle"')));
  assert.ok(warnings.some((w) => w.startsWith('"unused"')));
});
