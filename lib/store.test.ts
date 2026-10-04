import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Fields } from './dimension.ts';
import { createStore, readModuleRows, writeExtraRows, readExtraRows, writeModuleRows } from './store.ts';

const fields = {
  size: { type: 'number', placement: 'detail', label: 'Size', decimals: 1 },
  kind: { type: 'enum', placement: 'detail', label: 'Kind', values: ['a', 'b'] },
  flag: { type: 'boolean', placement: 'detail', label: 'Flag', nullable: false, default: false },
} as const satisfies Fields;

function withStore(run: (db: ReturnType<typeof createStore>) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'store-test-'));
  const db = createStore(join(dir, 'test.sqlite'));
  try {
    run(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('rows round-trip; numbers are rounded, booleans decoded, missing non-nullable gets its default', () => {
  withStore((db) => {
    const stats = writeModuleRows(db, 'demo', fields, [{ urn: 1, size: 1.2345, kind: 'a', flag: true }, { urn: 2 }, { urn: 99, size: 1 }], (urn) => urn < 10);
    assert.deepEqual(stats, { inserted: 2, outOfScope: 1 });
    const rows = readModuleRows(db, 'demo', fields);
    assert.deepEqual(rows.get(1), { size: 1.2, kind: 'a', flag: true });
    assert.deepEqual(rows.get(2), { size: null, kind: null, flag: false });
    assert.equal(rows.has(99), false);
  });
});

test('bad rows are rejected with the school and the problem', () => {
  withStore((db) => {
    assert.throws(() => writeModuleRows(db, 'a', fields, [{ urn: 1, kind: 'c' }], () => true), /urn 1.*kind/);
  });
  withStore((db) => {
    assert.throws(() => writeModuleRows(db, 'a', fields, [{ urn: 1, nope: 1 }], () => true), /undeclared field.*nope/);
  });
  withStore((db) => {
    assert.throws(() => writeModuleRows(db, 'a', fields, [{ urn: 1 }, { urn: 1 }], () => true), /more than one row/);
  });
});

test('extra tables hold several rows per school', () => {
  withStore((db) => {
    writeExtraRows(db, 'demo', 'history', { description: 'demo', columns: { year: 'text', value: 'real' } }, [{ urn: 1, year: '2023', value: 1 }, { urn: 1, year: '2024', value: 2 }], () => true);
    assert.equal(readExtraRows(db, 'demo', 'history').length, 2);
  });
});
