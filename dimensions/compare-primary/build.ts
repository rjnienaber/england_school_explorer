// Numbers the primary shortlist comparison needs about the whole country, worked out once when the primary data is built.
// The comparison itself runs in the browser (dimensions/compare/web.ts): this module has no fields and no source of its own.
//
// Metadata (small, in the primary core.json):
//   compareQuantiles         101 percentile points of each measure among state-funded primary schools (for the weights)
//   compareGradePercentiles  the percentile that each Ofsted level counts as
//   compareAverages          the average of each measure over the state-funded schools on this map: weighted by the
//                            Year 6 pupils each figure is based on, except progress scores (a plain average of schools,
//                            as they have no pupil count). Our own calculations: DfE's official England figures cover
//                            schools this map leaves out, so they differ a little.
//
// Secondary has its own module (`compare`) because it also builds standard-error columns for the national rank band, which
// primary does not offer. A module covers whole phases, and `compare` depends on secondary-only data.

import { defineDimension } from '../../lib/dimension.ts';
import { OFSTED_RANK } from '../compare/measures.ts';
import { gradePercentiles, quantileTable, weightedMean } from '../compare/stats.ts';

const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const module = defineDimension({
  id: 'compare-primary',
  title: 'Shortlist comparison (primary)',
  dependsOn: ['ks2-results', 'absence', 'ofsted'],
  phases: ['primary'],
  fields: {},

  build(ctx) {
    const ks2 = ctx.read('ks2-results');
    const absence = ctx.read('absence');
    const ofsted = ctx.read('ofsted');

    interface Point {
      urn: number;
      expected: number | null;
      higher: number | null;
      cohort: number | null;
      expectedAvg: number | null;
      readScore: number | null;
      mathsScore: number | null;
      readProgress: number | null;
      writeProgress: number | null;
      mathsProgress: number | null;
      absence: number | null;
      absencePupils: number | null;
      grade: number | null;
    }
    const state: Point[] = ctx.schools.all
      .filter((s) => ctx.schools.isState(s.urn))
      .map((s) => {
        const k = ks2.get(s.urn);
        const ab = absence.get(s.urn);
        const level = ofsted.get(s.urn)?.ofstedSummary;
        return {
          urn: s.urn,
          expected: number(k?.ks2RwmExpected),
          higher: number(k?.ks2RwmHigher),
          cohort: number(k?.ks2Cohort),
          expectedAvg: number(k?.ks2RwmExpectedAvg),
          readScore: number(k?.ks2ReadScore),
          mathsScore: number(k?.ks2MathsScore),
          readProgress: number(k?.ks2ReadProgress),
          writeProgress: number(k?.ks2WriteProgress),
          mathsProgress: number(k?.ks2MathsProgress),
          absence: number(ab?.absencePersistentPct),
          absencePupils: number(ab?.absencePupils),
          grade: typeof level === 'string' && level in OFSTED_RANK ? OFSTED_RANK[level as keyof typeof OFSTED_RANK] : null,
        };
      });

    // ---- Percentile tables: state-funded primary schools
    const column = (pick: (p: Point) => number | null) => state.map(pick).filter((v): v is number => v !== null);
    const sources: Record<string, (p: Point) => number | null> = {
      rwmExpected: (p) => p.expected,
      rwmHigher: (p) => p.higher,
      readProgress: (p) => p.readProgress,
      writeProgress: (p) => p.writeProgress,
      mathsProgress: (p) => p.mathsProgress,
      absence: (p) => p.absence,
    };
    const compareQuantiles: Record<string, number[]> = {};
    for (const [id, pick] of Object.entries(sources)) {
      const table = quantileTable(column(pick));
      if (table) compareQuantiles[id] = table.map((v) => Math.round(v * 100) / 100);
    }

    const gradeCounts: Record<number, number> = {};
    for (const p of state) if (p.grade !== null) gradeCounts[p.grade] = (gradeCounts[p.grade] ?? 0) + 1;
    const compareGradePercentiles = Object.fromEntries(Object.entries(gradePercentiles(gradeCounts)).map(([g, v]) => [g, Math.round(v * 10) / 10]));

    // ---- Averages
    const avg = (value: (p: Point) => number | null, weight: (p: Point) => number | null, places = 1) => {
      const m = weightedMean(state.map((p) => ({ value: value(p), weight: weight(p) })));
      return m === null ? null : Math.round(m * 10 ** places) / 10 ** places;
    };
    const unweighted = (value: (p: Point) => number | null, places: number) => avg(value, (p) => (value(p) === null ? null : 1), places);
    const graded = state.filter((p) => p.grade !== null);
    const compareAverages = {
      state: {
        rwmExpected: avg((p) => p.expected, (p) => p.cohort, 0),
        rwmHigher: avg((p) => p.higher, (p) => p.cohort, 0),
        rwmExpectedAvg: avg((p) => p.expectedAvg, (p) => p.cohort, 0),
        readScore: avg((p) => p.readScore, (p) => p.cohort, 0),
        mathsScore: avg((p) => p.mathsScore, (p) => p.cohort, 0),
        readProgress: unweighted((p) => p.readProgress, 2),
        writeProgress: unweighted((p) => p.writeProgress, 2),
        mathsProgress: unweighted((p) => p.mathsProgress, 2),
        absence: avg((p) => p.absence, (p) => p.absencePupils),
        ofstedGoodPct: graded.length ? Math.round((graded.filter((p) => p.grade! >= OFSTED_RANK.good).length / graded.length) * 1000) / 10 : null,
      },
    };
    ctx.log(`${state.length} state primaries; percentile tables for ${Object.keys(compareQuantiles).join(', ')}`);

    return { rows: [], metadata: { compareQuantiles, compareGradePercentiles, compareAverages } };
  },
});
