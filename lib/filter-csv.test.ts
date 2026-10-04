import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell } from './csv.ts';
import { encoder } from './filter-csv.ts';

test('csvCell quotes only when needed', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
});

test('windows-1252 output: curly quotes, euro and plain accents go back to the bytes GIAS uses', () => {
  const bytes = encoder('windows-1252')('LADY HAWKINS\u2019 \u20ac caf\u00e9');
  assert.deepEqual([...bytes], [...Buffer.from('LADY HAWKINS', 'latin1'), 0x92, 0x20, 0x80, 0x20, ...Buffer.from('caf', 'latin1'), 0xe9]);
  // and a character it can't hold becomes "?", not a broken file
  assert.deepEqual([...encoder('windows-1252')('\u4e2d')], [0x3f]);
});

test('utf-8 output is utf-8', () => {
  assert.deepEqual([...encoder('utf-8')('\u2019')], [0xe2, 0x80, 0x99]);
});
