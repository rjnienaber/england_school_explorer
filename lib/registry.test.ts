import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineDimension, type Fields } from './dimension.ts';
import { loadBuildOrder, sortDimensions, validateDimensions, type LoadedDimension } from './registry.ts';

function fake(id: string, opts: { dependsOn?: string[]; scope?: boolean; fields?: Fields } = {}): LoadedDimension {
  const module = defineDimension({
    id,
    title: id,
    dependsOn: opts.dependsOn,
    scope: opts.scope,
    fields: opts.fields ?? { [`${id.replace(/-/g, '')}Value`]: { type: 'number', placement: 'detail', label: id } },
    build: () => [],
  });
  return { id, dir: `/fake/${id}`, module, sources: [], hasWeb: false };
}

test('build order: scope first, dependencies before dependents, ties alphabetical', () => {
  const list = [fake('zeta', { dependsOn: ['alpha'] }), fake('alpha'), fake('core', { scope: true }), fake('beta', { dependsOn: ['zeta'] })];
  assert.deepEqual(sortDimensions(list).map((d) => d.id), ['core', 'alpha', 'zeta', 'beta']);
});

test('a dependency cycle is reported', () => {
  const list = [fake('core', { scope: true }), fake('aa', { dependsOn: ['bb'] }), fake('bb', { dependsOn: ['aa'] })];
  assert.throws(() => sortDimensions(list), /cycle.*aa.*bb/i);
});

test('validation: needs exactly one scope module', () => {
  assert.throws(() => validateDimensions([fake('a')]), /exactly one module must set scope/);
  assert.throws(() => validateDimensions([fake('a', { scope: true }), fake('b', { scope: true })]), /exactly one module must set scope/);
});

test('validation: unknown dependency, duplicate field and module id mismatch', () => {
  const dup: Fields = { pupils: { type: 'number', placement: 'detail', label: 'Pupils' } };
  const mismatch = fake('folder');
  mismatch.module.id = 'other';
  const list = [
    fake('core', { scope: true, fields: dup }),
    fake('a', { dependsOn: ['missing'], fields: dup }),
    mismatch,
  ];
  assert.throws(
    () => validateDimensions(list),
    (err: Error) =>
      /dependsOn "missing"/.test(err.message) && /field "pupils" is already declared by core/.test(err.message) && /module\.id is "other"/.test(err.message),
  );
});

test('validation: a non-nullable field needs a default; a year must name a declared field', () => {
  const list = [
    fake('core', { scope: true }),
    fake('a', { fields: { flag: { type: 'boolean', placement: 'detail', label: 'Flag', nullable: false }, n: { type: 'number', placement: 'detail', label: 'N', year: 'nope' } } }),
  ];
  assert.throws(() => validateDimensions(list), (err: Error) => /needs a default/.test(err.message) && /year "nope"/.test(err.message));
});

test('the real dimensions load, validate and sort with the scope module first', async () => {
  const order = await loadBuildOrder();
  assert.equal(order[0].id, 'gias-core');
  const position = (id: string) => order.findIndex((d) => d.id === id);
  assert.ok(position('ks4-headline') < position('intake-model'));
});
