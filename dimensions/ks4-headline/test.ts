import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleRows, skipWithoutStore } from '../../lib/test-store.ts';
import { p8Band } from './bands.ts';
import { module } from './build.ts';

test('p8Band follows the DfE rules', () => {
  assert.equal(p8Band(0.6, 0.4, 0.8), 'well-above');
  assert.equal(p8Band(0.3, 0.1, 0.5), 'above');
  assert.equal(p8Band(-0.2, -0.44, 0.04), 'average');
  assert.equal(p8Band(-0.3, -0.5, -0.1), 'below');
  assert.equal(p8Band(-0.6, -0.8, -0.4), 'well-below');
});

test('ks4-headline: a known school', skipWithoutStore, () => {
  const r = moduleRows('ks4-headline', module.fields).get(100049);
  assert.ok(r);
  assert.equal(r.ks4Year, '2024/25');
  assert.equal(r.att8, 41.5);
  assert.equal(r.att8Prev, 44.2);
  assert.equal(r.att8Years, 3);
  assert.equal(r.p8, -0.2);
  assert.equal(r.p8Band, 'average');
  assert.equal(r.att8Pct, 27);
});
