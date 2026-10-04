// "Who comes out strongest on my list?" by simulation, with a fixed seed so the answer is reproducible.
//
// Each measure is turned into a percentile among comparable schools (state-funded mainstream), so a point of
// Progress 8 and a percentage point of absence can be added up. In each draw every school's value on each
// measure is picked at random from its own uncertainty (a normal around the value with its standard error),
// turned into a percentile, and combined with the person's weights. We count how often each school comes out
// on top and in which places. A school missing a measure is scored on the others (its weights are rescaled),
// so a gap in the data neither helps nor hurts. Grades with no uncertainty (Ofsted) do not vary between draws.

import { makeNormal, makeRng, percentileIn, type Reading } from './stats.ts';

export interface SimMeasure {
  weight: number;
  higherIsBetter: boolean;
  /** 101 quantiles of the measure among comparable schools, for turning a value into a percentile. Null for an ordinal measure. */
  table: readonly number[] | null;
  /** For an ordinal measure: percentile (0-100, higher is better already) of each grade, by its value. */
  gradePercentile?: Readonly<Record<number, number>>;
}

export interface SimSchool {
  id: number;
  /** One per measure, in the same order as the measures. */
  readings: (Reading | null)[];
}

export interface SimResult {
  draws: number;
  /** Per school: the share of draws in which it came out on top (ties split the credit). Null if it has no usable measure. */
  strongest: (number | null)[];
  /** Per school: how many draws ended in each place (index 0 = first). Places are shared by ties (the better place). */
  places: number[][];
}

export const DRAWS = 2000;
export const SEED = 20260925;

/** The percentile score (0-100, higher is better) of a reading on a measure, or null if it can't be scored. */
export function percentileScore(m: SimMeasure, value: number): number | null {
  if (m.table) {
    const pct = percentileIn(m.table, value);
    return m.higherIsBetter ? pct : 100 - pct;
  }
  return m.gradePercentile?.[value] ?? null;
}

export function simulateShortlist(schools: SimSchool[], measures: SimMeasure[], draws = DRAWS, seed = SEED): SimResult {
  const n = schools.length;
  const normal = makeNormal(makeRng(seed));
  const strongest = new Array<number>(n).fill(0);
  const places = schools.map(() => new Array<number>(n).fill(0));
  const usable = schools.map((s) => s.readings.some((r, i) => r !== null && !r.unknownSe && measures[i].weight > 0));
  const scores = new Array<number>(n);

  for (let d = 0; d < draws; d++) {
    for (let s = 0; s < n; s++) {
      if (!usable[s]) {
        scores[s] = -Infinity;
        continue;
      }
      let total = 0;
      let weight = 0;
      for (let m = 0; m < measures.length; m++) {
        const r = schools[s].readings[m];
        const meas = measures[m];
        if (!r || r.unknownSe || meas.weight <= 0) continue;
        const noise = r.se === null ? 0 : normal() * r.se;
        const score = percentileScore(meas, r.value + noise);
        if (score === null) continue;
        total += meas.weight * score;
        weight += meas.weight;
      }
      scores[s] = weight > 0 ? total / weight : -Infinity;
    }
    let top = -Infinity;
    for (let s = 0; s < n; s++) if (scores[s] > top) top = scores[s];
    if (top === -Infinity) continue;
    let tied = 0;
    for (let s = 0; s < n; s++) if (scores[s] === top) tied++;
    for (let s = 0; s < n; s++) {
      if (scores[s] === -Infinity) continue;
      if (scores[s] === top) strongest[s] += 1 / tied;
      let ahead = 0;
      for (let t = 0; t < n; t++) if (scores[t] > scores[s]) ahead++;
      places[s][ahead]++;
    }
  }
  return { draws, strongest: strongest.map((c, s) => (usable[s] ? c / draws : null)), places };
}

/**
 * The shortest run of consecutive places that holds at least `coverage` of the draws (the first such run
 * if several are equally short): `{ lo: 1, hi: 2, share: 0.83 }` reads "1st or 2nd in 83% of draws".
 */
export function placeRange(counts: number[], draws: number, coverage = 0.8): { lo: number; hi: number; share: number } {
  let best: { lo: number; hi: number; share: number } | null = null;
  for (let lo = 0; lo < counts.length; lo++) {
    let sum = 0;
    for (let hi = lo; hi < counts.length; hi++) {
      sum += counts[hi];
      const share = sum / draws;
      if (share < coverage) continue;
      const width = hi - lo;
      if (!best || width < best.hi - best.lo || (width === best.hi - best.lo && share > best.share)) best = { lo: lo + 1, hi: hi + 1, share };
      break;
    }
  }
  return best ?? { lo: 1, hi: counts.length, share: counts.reduce((a, b) => a + b, 0) / draws };
}
