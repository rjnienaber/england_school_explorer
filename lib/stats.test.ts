import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Scope } from './dimension.ts';
import { linearFit, makeStatsToolkit, mean, median, multipleFit, percentileRanker, round } from './stats.ts';

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

test('multipleFit recovers a known plane, its R² and its leverage', () => {
  // y = 2 + 3a - 1b, then a fixed wobble of ±0.5
  const x: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 40; i++) {
    const a = i % 8;
    const b = (i * 7) % 11;
    x.push([a, b]);
    y.push(2 + 3 * a - b + (i % 2 ? 0.5 : -0.5));
  }
  const fit = multipleFit(x, y);
  assert.ok(Math.abs(fit.coefficients[0] - 3) < 0.1);
  assert.ok(Math.abs(fit.coefficients[1] + 1) < 0.1);
  assert.ok(Math.abs(fit.intercept - 2) < 0.3);
  assert.ok(fit.r2 > 0.98 && fit.r2 < 1);
  assert.ok(fit.adjR2 < fit.r2);
  assert.ok(Math.abs(fit.rse - 0.5) < 0.1);
  assert.ok(fit.standardised[0] > 0 && fit.standardised[1] < 0);
  assert.ok(Math.abs(fit.predict([4, 5]) - (2 + 12 - 5)) < 0.3);
  // A point far from the others has higher leverage; the leverages of the data sum to the parameter count
  assert.ok(fit.leverage([50, 50]) > fit.leverage([4, 5]));
  assert.ok(Math.abs(x.reduce((s, row) => s + fit.leverage(row), 0) - 3) < 1e-6);
});

test('multipleFit with one predictor agrees with linearFit; collinear or too little data throws', () => {
  const points: [number, number][] = [[1, 2], [2, 4.5], [3, 5], [4, 8.5], [5, 9]];
  const one = linearFit(points);
  const many = multipleFit(points.map(([a]) => [a]), points.map(([, b]) => b));
  assert.ok(Math.abs(many.coefficients[0] - one.slope) < 1e-9);
  assert.ok(Math.abs(many.intercept - one.intercept) < 1e-9);
  assert.ok(Math.abs(Math.sqrt(many.r2) - one.r) < 1e-9);
  assert.throws(() => multipleFit([[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]], [1, 2, 3, 5, 4]), /collinear/);
  assert.throws(() => multipleFit([[1, 2], [2, 3]], [1, 2]), /too few/);
});
