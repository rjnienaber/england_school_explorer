import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearSharedCsv, readCsv, readCsvShared, type Row } from './csv.ts';

const file = new URL('../dimensions/ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('readCsvShared replays the same rows as readCsv, and the same objects on a second read', async () => {
  const direct: Row[] = [];
  for await (const r of readCsv(file)) direct.push(r);
  const first: Row[] = [];
  for await (const r of readCsvShared(file)) first.push(r);
  const second: Row[] = [];
  for await (const r of readCsvShared(file)) second.push(r);
  assert.deepEqual(first, direct);
  assert.equal(second.length, first.length);
  assert.ok(second.every((r, i) => r === first[i]));
  clearSharedCsv();
});
