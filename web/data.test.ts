import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CoreFile } from '../lib/columnar.ts';
import { SchoolData } from './data.ts';

const core: CoreFile = {
  buildId: 'b1',
  count: 3,
  shards: 2,
  metadata: { builtAt: 'x', sources: {} },
  fields: {
    name: { placement: 'core', type: 'string' },
    band: { placement: 'mode', type: 'enum', lookup: ['low', 'high'] },
    note: { placement: 'detail', type: 'string' },
    flag: { placement: 'detail', type: 'boolean', default: false },
  },
  needs: { modes: { m: ['band'] }, filters: { f: { true: [], false: ['band'] } }, popup: {} },
  urnDeltas: [10, 1, 1],
  lng: [0, 1, 2],
  lat: [50, 51, 52],
  columns: { name: ['A', 'B', 'C'] },
};

/** Serves files by URL, counting requests. Throws like a 404 for anything else. */
function fakeServer(buildId = 'b1') {
  const requests: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requests.push(url);
    const files: Record<string, unknown> = {
      'data/modes/band.json': { buildId, values: [1, 0, null] },
      'data/details/0.json': { buildId, schools: { 10: { note: 'n10' }, 12: { flag: true, band: 'low' } } },
      'data/details/1.json': { buildId, schools: { 11: {} } },
    };
    const path = url.split('?')[0];
    return { ok: path in files, status: path in files ? 200 : 404, json: async () => files[path] };
  }) as unknown as typeof fetch;
  return requests;
}

test('core fields are there at once; a mode column is fetched once, versioned, and shared', async () => {
  const requests = fakeServer();
  const data = new SchoolData(core);
  assert.equal(data.byUrn.get(11)!.properties.name, 'B');
  assert.equal(data.hasFields(['name']), true);
  assert.equal(data.hasFields(['band']), false);
  await Promise.all([data.ensureFields(['band', 'name']), data.ensureFields(['band'])]);
  await data.ensureFields(['band']);
  assert.deepEqual(requests, ['data/modes/band.json?v=b1']);
  assert.deepEqual(data.features.map((f) => f.properties.band), ['high', 'low', null]);
  assert.equal(data.hasFields(['band']), true);
});

test('a shard fills every non-core field of its schools; defaults stand in for omitted values', async () => {
  const requests = fakeServer();
  const data = new SchoolData(core);
  assert.equal(data.hasField('note', 10), false);
  await data.getDetails(10);
  await data.getDetails(12);
  assert.deepEqual(requests, ['data/details/0.json?v=b1']);
  assert.equal(data.hasField('note', 12), true);
  assert.equal(data.hasField('note', 11), false);
  const [a, , c] = data.features.map((f) => f.properties);
  assert.deepEqual([a.note, a.flag, c.flag, c.note], ['n10', false, true, null]);
  assert.equal((c as unknown as Record<string, unknown>).band, 'low');
});

test('a detail field cannot be requested as a column', () => {
  fakeServer();
  assert.throws(() => new SchoolData(core).ensureFields(['note']), /detail field/);
});

test('files from another build are rejected, and a failed request can be retried', async () => {
  fakeServer('b2');
  const data = new SchoolData(core);
  await assert.rejects(data.ensureFields(['band']), /data was updated/);
  const requests = fakeServer('b1');
  await data.ensureFields(['band']);
  assert.equal(requests.length, 1);
});

test('what a view needs: the mode plus each filter at its current value', () => {
  const data = new SchoolData(core);
  assert.deepEqual(data.viewFields('m', { f: true }), ['band']);
  assert.deepEqual(data.viewFields('m', { f: false }), ['band']);
  // an id the build doesn't know (a stale page): load every column rather than guess
  assert.deepEqual(data.viewFields('other', { f: true }).sort(), ['band', 'name']);
});
