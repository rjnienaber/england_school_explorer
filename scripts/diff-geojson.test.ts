import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
