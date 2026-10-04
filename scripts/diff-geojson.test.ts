import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = join(import.meta.dirname, 'diff-geojson.ts');
const feature = (urn: number, props: Record<string, unknown>) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 51] },
  properties: { urn, ...props },
});
const collection = (features: unknown[], builtAt = 'x') => ({ type: 'FeatureCollection', metadata: { builtAt, sources: {} }, features });

function run(a: unknown, b: unknown, ...flags: string[]): { status: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'diff-test-'));
  try {
    writeFileSync(join(dir, 'a.json'), JSON.stringify(a));
    writeFileSync(join(dir, 'b.json'), JSON.stringify(b));
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, join(dir, 'a.json'), join(dir, 'b.json'), ...flags], { encoding: 'utf-8' });
    return { status: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('identical data, property order and builtAt do not matter', () => {
  const a = collection([feature(1, { x: 1, y: 2 })], 'one');
  const b = collection([feature(1, { y: 2, x: 1 })], 'two');
  assert.equal(run(a, b).status, 0);
});

test('a changed, removed or missing value is reported', () => {
  assert.equal(run(collection([feature(1, { x: 1 })]), collection([feature(1, { x: 2 })])).status, 1);
  assert.equal(run(collection([feature(1, { x: 1 })]), collection([feature(1, {})])).status, 1);
  assert.equal(run(collection([feature(1, {}), feature(2, {})]), collection([feature(1, {})])).status, 1);
});

test('new properties fail unless --allow-new-properties', () => {
  const a = collection([feature(1, { x: 1 })]);
  const b = collection([feature(1, { x: 1, z: 3 })]);
  assert.equal(run(a, b).status, 1);
  assert.equal(run(a, b, '--allow-new-properties').status, 0);
});

test('a data folder is rebuilt before comparing, and equals the geojson it came from', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diff-folder-'));
  try {
    const fields = {
      name: { placement: 'core', type: 'string' },
      band: { placement: 'mode', type: 'enum', lookup: ['low', 'high'] },
      note: { placement: 'detail', type: 'string' },
    };
    mkdirSync(join(dir, 'data/modes'), { recursive: true });
    mkdirSync(join(dir, 'data/details'));
    const core = {
      buildId: 'b1', count: 2, shards: 2, metadata: { builtAt: 'x', sources: {} }, fields, needs: { modes: {}, filters: {}, popup: {} },
      urnDeltas: [3, 1], lng: [0, 1], lat: [51, 52], columns: { name: ['A', 'B'] },
    };
    writeFileSync(join(dir, 'data/core.json'), JSON.stringify(core));
    writeFileSync(join(dir, 'data/modes/band.json'), JSON.stringify({ buildId: 'b1', values: [1, null] }));
    // urn 3 is in shard 1, urn 4 in shard 0; a missing detail value means null
    writeFileSync(join(dir, 'data/details/0.json'), JSON.stringify({ buildId: 'b1', schools: { 4: { band: null } } }));
    writeFileSync(join(dir, 'data/details/1.json'), JSON.stringify({ buildId: 'b1', schools: { 3: { note: 'hi', band: 'high' } } }));
    const geo = (note: string | null) => ({
      type: 'FeatureCollection',
      metadata: { builtAt: 'y', sources: {} },
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 51] }, properties: { urn: 3, name: 'A', band: 'high', note } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 52] }, properties: { urn: 4, name: 'B', band: null, note: null } },
      ],
    });
    writeFileSync(join(dir, 'a.geojson'), JSON.stringify(geo('hi')));
    const ok = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, join(dir, 'a.geojson'), join(dir, 'data')], { encoding: 'utf-8' });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    writeFileSync(join(dir, 'a.geojson'), JSON.stringify(geo('other')));
    const bad = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, join(dir, 'a.geojson'), join(dir, 'data')], { encoding: 'utf-8' });
    assert.equal(bad.status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
