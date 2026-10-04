import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Scope } from './dimension.ts';
import { linearFit, makeStatsToolkit, mean, median, percentileRanker, round } from './stats.ts';

test('percentileRanker gives ties the middle rank', () => {
  const rank = percentileRanker([1, 2, 3, 4, 5]);
  assert.equal(rank(1), 10);
  assert.equal(rank(3), 50);
  assert.equal(rank(5), 90);
  assert.equal(percentileRanker([5, 5, 5, 5])(5), 50);
});

test('linearFit recovers a straight line', () => {
  const fit = linearFit([[0, 1], [1, 3], [2, 5], [3, 7]]);
  assert.ok(Math.abs(fit.slope - 2) < 1e-9);
  assert.ok(Math.abs(fit.intercept - 1) < 1e-9);
  assert.ok(Math.abs(fit.r - 1) < 1e-9);
});

test('mean, median and round', () => {
  assert.equal(mean([1, 2, 3, 6]), 3);
  assert.equal(mean([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(round(null), null);
});

test('the toolkit only ranks state schools, and can flip direction', () => {
  const all = [
    { urn: 1, lng: 0, lat: 0, sector: 'state', selective: false },
    { urn: 2, lng: 0, lat: 0, sector: 'state', selective: false },
    { urn: 3, lng: 0, lat: 0, sector: 'state', selective: false },
    { urn: 4, lng: 0, lat: 0, sector: 'independent', selective: false },
  ];
  const scope: Scope = {
    urns: new Set(all.map((s) => s.urn)),
    all,
    get: (urn) => all.find((s) => s.urn === urn),
    isState: (urn) => all.find((s) => s.urn === urn)?.sector === 'state',
  };
  const stats = makeStatsToolkit(scope);
  const population: [number, number][] = [[1, 10], [2, 20], [3, 30], [4, 1000]];
  assert.equal(stats.nationalMedianAmongState(population), 20);
  const rank = stats.percentileAmongState(population);
  assert.equal(rank(30), 83);
  const lowIsGood = stats.percentileAmongState(population, { higherIsBetter: false });
  assert.equal(lowIsGood(10), 83);
});
