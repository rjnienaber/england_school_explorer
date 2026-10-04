import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trace, traceNeeds } from './trace-needs.ts';

const names = new Set(['a', 'b', 'c']);

test('records the fields a function reads, over every school, ignoring urn and other keys', () => {
  const records = [
    { urn: 1, a: 1, b: null, c: 0 },
    { urn: 2, a: null, b: 5, c: 0 },
  ];
  // `b` is only read for schools where `a` is null: tracing one school would miss it
  const fn = (p: { urn: number; a: number | null; b: number | null }) => (p.a === null ? p.b : p.urn + p.a);
  assert.deepEqual(trace(records, names, fn as never), ['a', 'b']);
  assert.deepEqual(trace(records, names, (() => 1) as never), []);
});

test('every registered mode, filter value and popup piece gets an entry', async () => {
  const { FIELDS } = await import('../web/generated/fields.ts');
  const { MODES, FILTERS } = await import('../web/registry.ts');
  const { PIECES } = await import('../web/popup.ts');
  const record = { urn: 1, ...Object.fromEntries(Object.keys(FIELDS).map((k) => [k, null])) };
  const needs = await traceNeeds([record], Object.keys(FIELDS));
  assert.deepEqual(Object.keys(needs.modes).sort(), MODES.map((m) => m.id).sort());
  assert.deepEqual(Object.keys(needs.filters).sort(), FILTERS.map((f) => f.id).sort());
  assert.deepEqual(Object.keys(needs.popup).sort(), PIECES.map((p) => p.id).sort());
  for (const f of FILTERS) assert.ok(String(f.default) in needs.filters[f.id]);
  for (const fields of Object.values(needs.modes)) for (const n of fields) assert.ok(n in FIELDS);
});

test('the primary phase traces its own registry', async () => {
  const { FIELDS } = await import('../web/generated/fields.ts');
  const { registryFor } = await import('../web/registry.ts');
  const { piecesFor } = await import('../web/popup.ts');
  const { MODES, FILTERS } = registryFor('primary');
  const record = { urn: 1, ...Object.fromEntries(Object.keys(FIELDS).map((k) => [k, null])) };
  const needs = await traceNeeds([record], Object.keys(FIELDS), 'primary');
  assert.deepEqual(Object.keys(needs.modes).sort(), MODES.map((m) => m.id).sort());
  assert.deepEqual(Object.keys(needs.filters).sort(), FILTERS.map((f) => f.id).sort());
  assert.deepEqual(Object.keys(needs.popup).sort(), piecesFor('primary').map((p) => p.id).sort());
  assert.ok(!('sixthForm' in needs.filters));
});
