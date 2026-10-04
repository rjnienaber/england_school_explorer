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

export interface MultipleFit {
  /** Fitted value for one school's predictors (same order as the fitted columns). */
  predict(x: number[]): number;
  /** Raw-unit coefficients, one per predictor, and the intercept. */
  intercept: number;
  coefficients: number[];
  /** Effect on y of a one standard deviation rise in each predictor (comparable across predictors). */
  standardised: number[];
  /** Share of the variance in y explained (0-1), and the same adjusted for the number of predictors. */
  r2: number;
  adjR2: number;
  /** Residual standard error: the typical size of a miss, in the units of y. */
  rse: number;
  n: number;
  /** Leverage of a point: how far its predictors are from the typical school's (the variance of its fitted value is rse² × this). */
  leverage(x: number[]): number;
}

/** Inverts a small symmetric positive-definite matrix by Gauss-Jordan elimination. */
function invert(m: number[][]): number[][] {
  const k = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('multipleFit: predictors are collinear');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * k; j++) a[col][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f !== 0) for (let j = 0; j < 2 * k; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(k));
}

/**
 * Multiple linear regression (ordinary least squares) of y on several predictors, by the normal
 * equations. `x[i]` holds school i's predictors. Predictors are standardised internally so the
 * arithmetic stays well behaved, then the coefficients are turned back into raw units.
 */
export function multipleFit(x: number[][], y: number[]): MultipleFit {
  const n = y.length;
  const k = x[0]?.length ?? 0;
  if (n <= k + 1) throw new Error(`multipleFit: ${n} rows is too few for ${k} predictors`);
  const means = Array.from({ length: k }, (_, j) => x.reduce((s, row) => s + row[j], 0) / n);
  const sds = means.map((m, j) => Math.sqrt(x.reduce((s, row) => s + (row[j] - m) ** 2, 0) / (n - 1)));
  const z = (row: number[]) => row.map((v, j) => (v - means[j]) / sds[j]);
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  const zs = x.map(z);
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  zs.forEach((row, i) => {
    for (let a = 0; a < k; a++) {
      xty[a] += row[a] * (y[i] - meanY);
      for (let b = 0; b < k; b++) xtx[a][b] += row[a] * row[b];
    }
  });
  const inv = invert(xtx);
  const beta = inv.map((row) => row.reduce((s, v, b) => s + v * xty[b], 0));

  let sse = 0;
  let sst = 0;
  zs.forEach((row, i) => {
    const fitted = meanY + row.reduce((s, v, j) => s + v * beta[j], 0);
    sse += (y[i] - fitted) ** 2;
    sst += (y[i] - meanY) ** 2;
  });
  const coefficients = beta.map((b, j) => b / sds[j]);
  const intercept = meanY - coefficients.reduce((s, c, j) => s + c * means[j], 0);
  const r2 = 1 - sse / sst;
  return {
    intercept,
    coefficients,
    standardised: beta,
    r2,
    adjR2: 1 - ((1 - r2) * (n - 1)) / (n - k - 1),
    rse: Math.sqrt(sse / (n - k - 1)),
    n,
    predict: (row) => intercept + coefficients.reduce((s, c, j) => s + c * row[j], 0),
    leverage(row) {
      const v = z(row);
      return 1 / n + v.reduce((s, vi, a) => s + vi * inv[a].reduce((t, w, b) => t + w * v[b], 0), 0);
    },
  };
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
    multipleFit,
    mean,
    round,
  };
}
