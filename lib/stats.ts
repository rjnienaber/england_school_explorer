import type { Scope, StatsToolkit } from './dimension.ts';
/** Returns a function giving the percentile rank (0–100) of a value within `population`. */
export function percentileRanker(population: number[]): (value: number) => number {
  const sorted = [...population].sort((a, b) => a - b);

  // Index of the first element for which `before` is false
  const search = (before: (x: number) => boolean) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (before(sorted[mid])) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  return (value) => {
    const below = search((x) => x < value);
    const equal = search((x) => x <= value) - below;
    return Math.round(((below + equal / 2) / sorted.length) * 100);
  };
}

/** Ordinary least squares fit of y = intercept + slope·x. */
export function linearFit(points: [x: number, y: number][]): { intercept: number; slope: number; r: number } {
  const n = points.length;
  const meanX = points.reduce((s, [x]) => s + x, 0) / n;
  const meanY = points.reduce((s, [, y]) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  }
  const slope = sxy / sxx;
  return { intercept: meanY - slope * meanX, slope, r: sxy / Math.sqrt(sxx * syy) };
}

export const round = (value: number | null, places = 1): number | null =>
  value === null ? null : Math.round(value * 10 ** places) / 10 ** places;

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The stats API handed to modules as `ctx.stats`; the state-school helpers use the build's scope. */
export function makeStatsToolkit(scope: Scope): StatsToolkit {
  const stateValues = (population: Iterable<[number, number]>) => {
    const values: number[] = [];
    for (const [urn, value] of population) if (scope.isState(urn)) values.push(value);
    return values;
  };
  return {
    percentileAmongState(population, { higherIsBetter = true } = {}) {
      const values = stateValues(population);
      if (higherIsBetter) return percentileRanker(values);
      const rank = percentileRanker(values.map((v) => -v));
      return (value) => rank(-value);
    },
    nationalMedianAmongState: (population) => median(stateValues(population)),
    linearFit,
    mean,
    round,
  };
}
