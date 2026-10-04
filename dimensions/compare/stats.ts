// The statistics behind the shortlist comparison. Pure code: it runs in the browser and in the tests.
//
// Each measure is a value with a standard error (se). Two schools' values are compared by asking
// how likely it is that one is really higher, if both were measured with that much chance noise:
//   P(A > B) = Φ((a − b) / √(seA² + seB²))
// "Likely better" is P ≥ 0.9, "likely worse" is P ≤ 0.1, and anything between is "no clear difference".
// The se covers chance variation only (a small year group, a few pupils either way). It does not cover
// differences the measure cannot see, so a verdict is weaker than it sounds; the interface says so.

/** The standard normal cumulative distribution, accurate to about 1e-7 (Abramowitz and Stegun 7.1.26). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 + erf / 2 : 0.5 - erf / 2;
}

/** Standard error from a published 95% confidence interval (the interval is ±1.96 standard errors). */
export const seFromCi = (lower: number, upper: number) => (upper - lower) / 3.92;

/**
 * Standard error of a percentage (0-100) based on `n` pupils: the binomial √(p(1−p)/n), in percentage points.
 * A rate of exactly 0% or 100% is treated as half a pupil short of it, so that "nobody was suspended" is not
 * claimed to be known exactly (the plain formula would give it no uncertainty at all).
 */
export function seOfPercent(pct: number, n: number): number | null {
  if (!(n > 0) || pct < 0 || pct > 100) return null;
  const p = Math.min(1 - 0.5 / n, Math.max(0.5 / n, pct / 100));
  return 100 * Math.sqrt((p * (1 - p)) / n);
}

/** P(A is really higher than B). With no uncertainty on either side it is 1, 0 or 0.5 (equal). */
export function probHigher(a: number, seA: number, b: number, seB: number): number {
  const spread = Math.sqrt(seA * seA + seB * seB);
  if (spread === 0) return a > b ? 1 : a < b ? 0 : 0.5;
  return normalCdf((a - b) / spread);
}

export const LIKELY = 0.9;

export type Verdict = 'better' | 'same' | 'worse';

/** Likely better at 90% or more, likely worse at 10% or less, otherwise no clear difference. */
export const verdictOf = (p: number): Verdict => (p >= LIKELY ? 'better' : p <= 1 - LIKELY + 1e-9 ? 'worse' : 'same');

// ---------- Comparing two schools on one measure ----------

/** What the comparison needs from one school on one measure. `se` is null for an ordinal measure (a grade): only the order is known. */
export interface Reading {
  value: number;
  se: number | null;
  /**
   * A percentage-type figure whose uncertainty cannot be worked out (no group size). It is shown as it is but
   * takes no part in verdicts, probabilities or the suggested order. Not the same as `se: null` on a grade.
   */
  unknownSe?: boolean;
}

/**
 * How `a` compares with `b` on a measure where a higher value is better (flip the sign of lower-is-better
 * measures before calling, or pass `higherIsBetter`). Returns null if either is missing.
 * For an ordinal measure there is no probability: the verdict is "better" or "worse" only as a plain order,
 * and `prob` is null.
 */
export function compareReadings(
  a: Reading | null,
  b: Reading | null,
  higherIsBetter = true,
): { prob: number | null; verdict: Verdict; atLeastAsGood: boolean } | null {
  if (!a || !b || a.unknownSe || b.unknownSe) return null;
  const sign = higherIsBetter ? 1 : -1;
  const diff = sign * (a.value - b.value);
  if (a.se === null || b.se === null) {
    return { prob: null, verdict: diff > 0 ? 'better' : diff < 0 ? 'worse' : 'same', atLeastAsGood: diff >= 0 };
  }
  const prob = probHigher(sign * a.value, a.se, sign * b.value, b.se);
  return { prob, verdict: verdictOf(prob), atLeastAsGood: diff >= 0 };
}

// ---------- "Beaten on every measure" ----------

/** One school's readings, one per chosen measure (null where it has no value), and the direction of each measure. */
export interface Profile {
  id: number;
  readings: (Reading | null)[];
}

/**
 * Does `b` beat `a` on every chosen measure? That is Pareto dominance: `b` is at least as good as `a` on every
 * measure both have a value for, and likely better on at least one (ordinal measures can only be "at least as
 * good", never likely better, since they have no probability).
 *
 * Measures either school lacks are skipped, so a school is never beaten by a gap in the data, and two schools
 * with nothing in common are not compared. Because it needs no weights, it holds whatever the weights are
 * (on the point values).
 */
export function dominates(b: Profile, a: Profile, higherIsBetter: boolean[]): boolean {
  let likelyBetter = false;
  let compared = 0;
  for (let i = 0; i < higherIsBetter.length; i++) {
    const c = compareReadings(b.readings[i] ?? null, a.readings[i] ?? null, higherIsBetter[i]);
    if (!c) continue;
    compared++;
    if (!c.atLeastAsGood) return false;
    // An ordinal grade cannot be "likely better": it needs a probability
    if (c.prob !== null && c.verdict === 'better') likelyBetter = true;
  }
  return compared > 0 && likelyBetter;
}

/** For each school, the first other school that beats it on every chosen measure, or null. */
export function beatenBy(profiles: Profile[], higherIsBetter: boolean[]): (number | null)[] {
  return profiles.map((a) => profiles.find((b) => b !== a && dominates(b, a, higherIsBetter))?.id ?? null);
}

// ---------- Verdict of each school in a row, against the others ----------

export interface RowVerdict {
  better: number;
  worse: number;
  same: number;
  /** How many other schools it could be compared with. */
  others: number;
  /** Likely better than every other school with a value in the row (needs at least one other). */
  best: boolean;
}

/** Counts, for school `index` in a row, the others it is likely better than, likely worse than, or not clearly different from. */
export function rowVerdict(readings: (Reading | null)[], index: number, higherIsBetter: boolean): RowVerdict | null {
  const me = readings[index];
  if (!me) return null;
  const out: RowVerdict = { better: 0, worse: 0, same: 0, others: 0, best: false };
  readings.forEach((other, i) => {
    if (i === index) return;
    const c = compareReadings(me, other, higherIsBetter);
    if (!c) return;
    out.others++;
    out[c.verdict]++;
  });
  out.best = out.others > 0 && out.better === out.others;
  return out;
}

// ---------- Percentiles among comparable schools ----------

/** 101 values: the 0th, 1st ... 100th percentiles of `values` (linear between order statistics). Null for fewer than 2 values. */
export function quantileTable(values: number[]): number[] | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2) return null;
  return Array.from({ length: 101 }, (_, k) => {
    const pos = (k / 100) * (v.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(v.length - 1, lo + 1);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  });
}

/**
 * Percentile (0-100) of `value` in a table from `quantileTable`: interpolated, and 0 or 100 beyond the ends.
 * A value shared by a stretch of the table (many schools with 0% suspended) gets the middle of that stretch,
 * so a tie is not treated as the very best or worst.
 */
export function percentileIn(table: readonly number[], value: number): number {
  if (value < table[0]) return 0;
  if (value > table[100]) return 100;
  // The last index whose entry is at most the value
  let lo = 0;
  let hi = 100;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (table[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  if (table[lo] === value) {
    let first = lo;
    while (first > 0 && table[first - 1] === value) first--;
    return (first + lo) / 2;
  }
  return lo + (value - table[lo]) / (table[lo + 1] - table[lo]);
}

// ---------- Seeded random numbers ----------

/** A small seeded generator (mulberry32): the same seed always gives the same sequence. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws from a uniform generator (Box-Muller, using both values of each pair). */
export function makeNormal(rng: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u = 1 - rng(); // (0, 1]
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

// ---------- National figures (used when the data is built) ----------

/** Mean of `value` weighted by `weight`, ignoring rows missing either. Null if nothing is left. */
export function weightedMean(rows: { value: number | null; weight: number | null }[]): number | null {
  let total = 0;
  let weights = 0;
  for (const { value, weight } of rows) {
    if (value === null || weight === null || !(weight > 0)) continue;
    total += value * weight;
    weights += weight;
  }
  return weights > 0 ? total / weights : null;
}

/**
 * Percentile (0-100) to use for each grade of an ordered scale, so a grade can be added up with
 * percentile scores: the middle of the share of schools it covers. With 20% on grade 1, 50% on 2 and 30% on 3,
 * the grades score 10, 45 and 85.
 */
export function gradePercentiles(counts: Record<number, number>): Record<number, number> {
  const grades = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const total = grades.reduce((sum, g) => sum + counts[g], 0);
  const out: Record<number, number> = {};
  let below = 0;
  for (const g of grades) {
    out[g] = total === 0 ? 50 : ((below + counts[g] / 2) / total) * 100;
    below += counts[g];
  }
  return out;
}
