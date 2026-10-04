// Numbers the shortlist comparison needs about the whole country, worked out once when the data is built.
// The comparison itself runs in the browser (see web.ts): this module has no source of its own.
//
// Metadata (small, in core.json):
//   compareQuantiles       101 percentile points of each measure among state-funded mainstream schools, so the
//                          browser can turn a value into a percentile for the weights without every school's data
//   compareGradePercentiles  the percentile that each Ofsted level counts as
//   compareAverages        the pupil-weighted average of each measure over the state-funded schools on this map,
//                          and over all schools on this map. These are our own calculations: DfE's official
//                          England figures cover schools this map leaves out, so they differ a little.
// Fields (one column each, loaded only when someone asks where a school might rank nationally): the standard
// error of each measure for every state-funded school, so the browser can simulate everyone's uncertainty.

import { defineDimension } from '../../lib/dimension.ts';
import { DEFAULT_PUPIL_SD } from '../intake-model/model.ts';
import { OFSTED_RANK } from './measures.ts';
import { gradePercentiles, quantileTable, seOfPercent, seFromCi, weightedMean } from './stats.ts';

const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const seField = (label: string, description: string) => ({ type: 'number', decimals: 3, placement: 'mode', lazy: true, label, description }) as const;

export const module = defineDimension({
  id: 'compare',
  title: 'Shortlist comparison',
  dependsOn: ['gias-core', 'ks4-headline', 'ks4-pass-rates', 'absence', 'exclusions', 'intake-model', 'ofsted'],
  fields: {
    // Mode placement although no map mode reads them: the national rank band loads them on request, for every school
    cmpP8Se: seField('Progress 8, standard error', 'From the published 95% confidence interval: (upper − lower) / 3.92. Used by the shortlist comparison'),
    cmpIntakeSe: seField('Results vs intake, standard error', 'Copy of the standard error of "Attainment 8 vs expected for intake", as a column for every school. Chance variation only'),
    cmpAtt8Se: seField('Attainment 8, standard error', 'Pupil-level spread of Attainment 8 divided by the square root of the pupils in the year group. Chance variation only'),
    cmpAbsenceSe: seField('Persistent absence, standard error', 'Binomial standard error of the persistent absence rate, in percentage points, from the pupils counted. Chance variation only'),
    cmpSuspPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'mode',
      lazy: true,
      label: 'Pupils suspended at least once',
      description: 'Copy of "Pupils suspended at least once" as a column for every school, for the shortlist comparison',
    },
    cmpSuspSe: seField('Pupils suspended, standard error', 'Binomial standard error of the share of pupils suspended, in percentage points. Chance variation only'),
  },

  build(ctx) {
    const headline = ctx.read('ks4-headline');
    const pass = ctx.read('ks4-pass-rates');
    const absence = ctx.read('absence');
    const exclusions = ctx.read('exclusions');
    const intake = ctx.read('intake-model');
    const ofsted = ctx.read('ofsted');

    // One-year-group figures per school; `weight` is the number of pupils each figure is based on
    interface Point {
      urn: number;
      p8: number | null;
      p8Weight: number | null;
      intake: number | null;
      att8: number | null;
      engMaths5: number | null;
      engMaths4: number | null;
      cohort: number | null;
      absence: number | null;
      absencePupils: number | null;
      suspended: number | null;
      suspensionRate: number | null;
      exclusionsPupils: number | null;
      grade: number | null;
    }
    const points: Point[] = ctx.schools.all.map((s) => {
      const k = headline.get(s.urn);
      const ab = absence.get(s.urn);
      const ex = exclusions.get(s.urn);
      const level = ofsted.get(s.urn)?.ofstedSummary;
      return {
        urn: s.urn,
        p8: number(k?.p8),
        p8Weight: number(k?.ks4Cohort),
        intake: number(intake.get(s.urn)?.att8VsIntake),
        att8: number(k?.att8),
        engMaths5: number(k?.engMaths5),
        engMaths4: number(pass.get(s.urn)?.engMaths4),
        cohort: number(k?.ks4Cohort),
        absence: number(ab?.absencePersistentPct),
        absencePupils: number(ab?.absencePupils),
        suspended: number(ex?.suspendedPupilsPct),
        suspensionRate: number(ex?.suspensionRate),
        exclusionsPupils: number(ex?.exclusionsPupils),
        grade: typeof level === 'string' && level in OFSTED_RANK ? OFSTED_RANK[level as keyof typeof OFSTED_RANK] : null,
      };
    });
    const state = points.filter((p) => ctx.schools.isState(p.urn));

    // ---- Percentile tables: state-funded mainstream schools, as for every other percentile here
    const column = (pick: (p: Point) => number | null) => state.map(pick).filter((v): v is number => v !== null);
    const quantileSources: Record<string, (p: Point) => number | null> = {
      p8: (p) => p.p8,
      intake: (p) => p.intake,
      att8: (p) => p.att8,
      engMaths5: (p) => p.engMaths5,
      engMaths4: (p) => p.engMaths4,
      absence: (p) => p.absence,
      suspended: (p) => p.suspended,
    };
    const compareQuantiles: Record<string, number[]> = {};
    for (const [id, pick] of Object.entries(quantileSources)) {
      const table = quantileTable(column(pick));
      if (table) compareQuantiles[id] = table.map((v) => Math.round(v * 100) / 100);
    }

    const gradeCounts: Record<number, number> = {};
    for (const p of state) if (p.grade !== null) gradeCounts[p.grade] = (gradeCounts[p.grade] ?? 0) + 1;
    const compareGradePercentiles = Object.fromEntries(Object.entries(gradePercentiles(gradeCounts)).map(([g, v]) => [g, Math.round(v * 10) / 10]));

    // ---- Averages, weighted by the pupils each figure is based on
    const averages = (set: Point[]) => {
      const avg = (value: (p: Point) => number | null, weight: (p: Point) => number | null, places = 1) => {
        const m = weightedMean(set.map((p) => ({ value: value(p), weight: weight(p) })));
        return m === null ? null : Math.round(m * 10 ** places) / 10 ** places;
      };
      const graded = set.filter((p) => p.grade !== null);
      return {
        p8: avg((p) => p.p8, (p) => p.p8Weight, 2),
        att8: avg((p) => p.att8, (p) => p.cohort),
        engMaths5: avg((p) => p.engMaths5, (p) => p.cohort),
        engMaths4: avg((p) => p.engMaths4, (p) => p.cohort),
        absence: avg((p) => p.absence, (p) => p.absencePupils),
        suspended: avg((p) => p.suspended, (p) => p.exclusionsPupils),
        suspensionRate: avg((p) => p.suspensionRate, (p) => p.exclusionsPupils),
        // Share of inspected schools rated Outstanding or Good (a school counts once, however large)
        ofstedGoodPct: graded.length ? Math.round((graded.filter((p) => p.grade! >= OFSTED_RANK.good).length / graded.length) * 1000) / 10 : null,
      };
    };
    const compareAverages = { state: averages(state), all: averages(points) };

    // ---- Standard-error columns for every state-funded school
    const rows = state.flatMap((p) => {
      const k = headline.get(p.urn);
      const lo = number(k?.p8Lower);
      const hi = number(k?.p8Upper);
      const row = {
        urn: p.urn,
        cmpP8Se: lo !== null && hi !== null && p.p8 !== null ? seFromCi(lo, hi) : null,
        cmpIntakeSe: number(intake.get(p.urn)?.att8VsIntakeSe),
        cmpAtt8Se: p.att8 !== null && p.cohort ? DEFAULT_PUPIL_SD / Math.sqrt(p.cohort) : null,
        cmpAbsenceSe: p.absence !== null && p.absencePupils ? seOfPercent(p.absence, p.absencePupils) : null,
        cmpSuspPct: p.suspended,
        cmpSuspSe: p.suspended !== null && p.exclusionsPupils ? seOfPercent(p.suspended, p.exclusionsPupils) : null,
      };
      return Object.entries(row).some(([key, v]) => key !== 'urn' && v !== null) ? [row] : [];
    });
    ctx.log(`${rows.length} state schools with figures; percentile tables for ${Object.keys(compareQuantiles).join(', ')}`);

    return { rows, metadata: { compareQuantiles, compareGradePercentiles, compareAverages } };
  },
});
