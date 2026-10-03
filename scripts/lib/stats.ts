import type { P8Band } from '../../shared/school.ts';

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

/**
 * DfE's Progress 8 banding. A school is only above or below average when its
 * whole 95% confidence interval is, and "well" above or below when the score
 * itself is also beyond ±0.5.
 */
export function p8Band(score: number, lower: number, upper: number): P8Band {
  if (lower > 0) return score >= 0.5 ? 'well-above' : 'above';
  if (upper < 0) return score <= -0.5 ? 'well-below' : 'below';
  return 'average';
}

export const round = (value: number | null, places = 1): number | null =>
  value === null ? null : Math.round(value * 10 ** places) / 10 ** places;

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}
