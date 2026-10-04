// Where one school might rank among every state-funded school, allowing for the uncertainty in everyone's figures.
//
// The same idea as the shortlist simulation, over about 3,300 schools: draw every school's value on each chosen
// measure from its own uncertainty, turn it into a percentile, combine with the person's weights, and see where
// the chosen school lands. Repeating that 400 times gives a range of ranks, of which we report the middle 80%
// ("roughly top 15-30%"). It is a range because the data cannot say more than that.
//
// "Stable" means the answer survives changing each weight up and down by half: the middle rank under each
// changed weighting still lies inside the original range. The draws are made once and reused for every
// weighting, so reweighting is cheap (a few million multiplications) while drawing is the slow part.

import { makeNormal, makeRng } from './stats.ts';
import { percentileScore, type SimMeasure } from './simulate.ts';

export interface PopMeasure extends SimMeasure {
  /** Per school (same order for every measure); NaN where the school has no value. */
  values: ArrayLike<number>;
  /** Per school standard errors; NaN or 0 where there is none (an ordinal grade). */
  ses: ArrayLike<number>;
}

export interface RankBand {
  /** Schools ranked (those with at least one chosen measure). */
  of: number;
  /** Ranks (1 = best) at the 10th, 50th and 90th percentile of the draws. */
  p10: number;
  p50: number;
  p90: number;
}

export interface RankResult {
  band: RankBand;
  /** True if the middle rank stays inside the original range when each weight moves by half either way. */
  stable: boolean;
}

export const NATIONAL_DRAWS = 400;
const MISSING = 255;
const GRID = 2048;

interface Lookup {
  grid: Uint8Array;
  lo: number;
  hi: number;
  /** Scores of a value below the lowest or above the highest quantile. */
  below: number;
  above: number;
}

/** Score on 0-200 (percentile × 2) as a byte, so 400 draws × 3,300 schools × 6 measures stay near 8 MB. A grid makes a lookup one step. */
function lookupFor(m: SimMeasure): Lookup | null {
  if (!m.table) return null;
  const grid = new Uint8Array(GRID + 1);
  const lo = m.table[0];
  const hi = m.table[100];
  const byte = (v: number) => Math.round(2 * (percentileScore(m, v) ?? 0));
  for (let i = 0; i <= GRID; i++) grid[i] = byte(lo + ((hi - lo) * i) / GRID);
  return { grid, lo, hi, below: byte(lo - 1), above: byte(hi + 1) };
}

function byteScore(l: Lookup, v: number): number {
  if (v < l.lo) return l.below;
  if (v > l.hi) return l.above;
  return l.grid[l.hi === l.lo ? 0 : Math.round(((v - l.lo) / (l.hi - l.lo)) * GRID)];
}

/** Draws every school's score on each measure, `draws` times. */
export async function drawScores(measures: PopMeasure[], n: number, draws = NATIONAL_DRAWS, seed = 7, yieldEvery = 0): Promise<Uint8Array[]> {
  const normal = makeNormal(makeRng(seed));
  const out = measures.map(() => new Uint8Array(draws * n));
  const lookups = measures.map(lookupFor);
  for (let d = 0; d < draws; d++) {
    for (let m = 0; m < measures.length; m++) {
      const meas = measures[m];
      const lookup = lookups[m];
      const target = out[m];
      const base = d * n;
      for (let s = 0; s < n; s++) {
        const v = meas.values[s];
        if (Number.isNaN(v)) {
          target[base + s] = MISSING;
          continue;
        }
        if (!lookup) {
          // An ordinal grade: fixed score
          const g = meas.gradePercentile?.[v];
          target[base + s] = g === undefined ? MISSING : Math.round(2 * g);
          continue;
        }
        const se = meas.ses[s];
        target[base + s] = byteScore(lookup, Number.isNaN(se) ? v : v + normal() * se);
      }
    }
    if (yieldEvery && d % yieldEvery === yieldEvery - 1) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

/** Ranks of school `target` in every draw under these weights (1 = best; schools with no chosen measure are not counted). */
export function ranksFor(scores: Uint8Array[], weights: number[], n: number, draws: number, target: number): { ranks: Int32Array; of: number } {
  const ranks = new Int32Array(draws);
  const total = new Float64Array(n);
  const wsum = new Float64Array(n);
  for (let d = 0; d < draws; d++) {
    total.fill(0);
    wsum.fill(0);
    const base = d * n;
    for (let m = 0; m < scores.length; m++) {
      const w = weights[m];
      if (!(w > 0)) continue;
      const column = scores[m];
      for (let s = 0; s < n; s++) {
        const b = column[base + s];
        if (b !== MISSING) {
          total[s] += w * b;
          wsum[s] += w;
        }
      }
    }
    if (wsum[target] === 0) {
      ranks[d] = 0;
      continue;
    }
    const mine = total[target] / wsum[target];
    let ahead = 0;
    for (let s = 0; s < n; s++) if (wsum[s] > 0 && total[s] / wsum[s] > mine) ahead++;
    ranks[d] = ahead + 1;
  }
  let of = 0;
  for (let s = 0; s < n; s++) if (wsum[s] > 0) of++;
  return { ranks, of };
}

/** The value at fraction `q` (0-1) of the sorted numbers, by nearest rank. */
const quantileOf = (sorted: ArrayLike<number>, q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

function bandOf(scores: Uint8Array[], weights: number[], n: number, draws: number, target: number): RankBand | null {
  const { ranks, of } = ranksFor(scores, weights, n, draws, target);
  // A draw with no rank means the school has none of the chosen measures: no band
  if (ranks.some((r) => r === 0)) return null;
  const sorted = Int32Array.from(ranks).sort();
  return { of, p10: quantileOf(sorted, 0.1), p50: quantileOf(sorted, 0.5), p90: quantileOf(sorted, 0.9) };
}

/** The rank range for `target` (an index into the population) and whether it holds up when each weight moves by half. */
export function rankBand(scores: Uint8Array[], weights: number[], n: number, draws: number, target: number): RankResult | null {
  const band = bandOf(scores, weights, n, draws, target);
  if (!band) return null;
  let stable = true;
  for (let m = 0; m < weights.length && stable; m++) {
    if (!(weights[m] > 0)) continue;
    for (const factor of [0.5, 1.5]) {
      const w = weights.slice();
      w[m] *= factor;
      const moved = bandOf(scores, w, n, draws, target);
      // Compare as shares of the schools ranked, since the number ranked can change slightly
      const share = (rank: number, of: number) => rank / of;
      if (!moved || share(moved.p50, moved.of) < share(band.p10, band.of) || share(moved.p50, moved.of) > share(band.p90, band.of)) stable = false;
    }
  }
  return { band, stable };
}

/** Wording for a band: "roughly top 15–30%". Rounded to the nearest 5% because the range is rough anyway. */
export function describeBand(b: RankBand): string {
  const pct = (rank: number) => Math.max(5, Math.min(100, Math.round(((rank / b.of) * 100) / 5) * 5));
  const lo = pct(b.p10);
  const hi = pct(b.p90);
  return lo === hi ? `roughly top ${hi}%` : `roughly top ${lo}–${hi}%`;
}
