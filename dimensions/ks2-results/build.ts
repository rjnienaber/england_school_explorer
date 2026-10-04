// KS2 (end of primary school) results: the share reaching the expected and higher standard in reading, writing and maths,
// average scaled scores, and progress where it was published (2022/23 only). Each school gets the latest year with a
// combined reading, writing and maths result. Cohorts are small (often under 30 pupils), so the cohort size travels with
// the results and the published three-year average is kept for a steadier figure.

import { defineDimension } from '../../lib/dimension.ts';
import { PROGRESS_BANDS, progressBand } from './bands.ts';
import { loadKs2, SUBJECTS, type Ks2School, type Ks2Year, type Subject } from './parse.ts';

/** Years with a result, newest first. */
function latestWith(school: Ks2School, years: string[], has: (y: Ks2Year) => boolean): [string, Ks2Year] | null {
  for (const label of years) {
    const year = school.years.get(label);
    if (year && has(year)) return [label, year];
  }
  return null;
}

const KEY = { Reading: 'Read', Writing: 'Write', Maths: 'Maths' } as const satisfies Record<Subject, string>;

export const module = defineDimension({
  id: 'ks2-results',
  title: 'Key stage 2 results (end of primary school)',
  dependsOn: ['gias-core'],
  phases: ['primary'],
  fields: {
    ks2Year: { type: 'string', placement: 'detail', label: 'KS2 results year', description: 'Latest year with a combined reading, writing and maths result', source: 'ks2' },
    ks2Cohort: {
      type: 'number',
      placement: 'mode',
      label: 'Pupils who took the KS2 tests',
      description: 'Number of eligible pupils at the end of Year 6. Under about 30, results swing a lot from year to year',
      source: 'ks2-info',
      year: 'ks2Year',
    },
    ks2RwmExpected: {
      type: 'number',
      placement: 'mode',
      label: 'Reaching the expected standard in reading, writing and maths (%)',
      description: 'Percentage of pupils reaching the expected standard in all three of reading, writing and maths',
      source: 'ks2',
      year: 'ks2Year',
    },
    ks2RwmHigher: {
      type: 'number',
      placement: 'mode',
      label: 'Reaching the higher standard in reading, writing and maths (%)',
      description: 'Percentage of pupils reaching the higher standard in all three of reading, writing and maths',
      source: 'ks2',
      year: 'ks2Year',
    },
    ks2RwmExpectedPct: {
      type: 'number',
      decimals: 0,
      placement: 'mode',
      label: 'Expected standard percentile',
      description: 'Percentile (0-100) of the share reaching the expected standard among state-funded mainstream primary schools in the same year. Our own ranking, not an official measure',
      source: 'ks2',
      year: 'ks2Year',
    },
    ks2RwmHigherPct: {
      type: 'number',
      decimals: 0,
      placement: 'mode',
      label: 'Higher standard percentile',
      description: 'Percentile (0-100) of the share reaching the higher standard among state-funded mainstream primary schools in the same year. Our own ranking, not an official measure',
      source: 'ks2',
      year: 'ks2Year',
    },
    ks2ReadExpected: { type: 'number', placement: 'detail', label: 'Reading: expected standard (%)', source: 'ks2', year: 'ks2Year' },
    ks2WriteExpected: { type: 'number', placement: 'detail', label: 'Writing: expected standard (%)', description: 'Writing is assessed by teachers', source: 'ks2', year: 'ks2Year' },
    ks2MathsExpected: { type: 'number', placement: 'detail', label: 'Maths: expected standard (%)', source: 'ks2', year: 'ks2Year' },
    ks2ReadHigher: { type: 'number', placement: 'detail', label: 'Reading: higher standard (%)', source: 'ks2', year: 'ks2Year' },
    ks2WriteHigher: { type: 'number', placement: 'detail', label: 'Writing: higher standard (%)', description: 'Writing is assessed by teachers', source: 'ks2', year: 'ks2Year' },
    ks2MathsHigher: { type: 'number', placement: 'detail', label: 'Maths: higher standard (%)', source: 'ks2', year: 'ks2Year' },
    ks2ReadScore: { type: 'number', decimals: 0, placement: 'detail', label: 'Reading: average scaled score', description: '100 is the expected standard, 110 the top of the scale', source: 'ks2', year: 'ks2Year' },
    ks2MathsScore: { type: 'number', decimals: 0, placement: 'detail', label: 'Maths: average scaled score', description: '100 is the expected standard, 110 the top of the scale', source: 'ks2', year: 'ks2Year' },
    ks2RwmExpectedPrev: { type: 'number', placement: 'detail', label: 'Expected standard, previous year (%)', source: 'ks2' },
    ks2RwmExpectedPrev2: { type: 'number', placement: 'detail', label: 'Expected standard, two years ago (%)', source: 'ks2' },
    ks2RwmHigherPrev: { type: 'number', placement: 'detail', label: 'Higher standard, previous year (%)', source: 'ks2' },
    ks2RwmHigherPrev2: { type: 'number', placement: 'detail', label: 'Higher standard, two years ago (%)', source: 'ks2' },
    ks2CohortPrev: { type: 'number', placement: 'detail', label: 'Pupils who took the KS2 tests, previous year', source: 'ks2-info' },
    ks2CohortPrev2: { type: 'number', placement: 'detail', label: 'Pupils who took the KS2 tests, two years ago', source: 'ks2-info' },
    ks2RwmExpectedAvg: {
      type: 'number',
      placement: 'detail',
      label: 'Expected standard, 3-year average (%)',
      description: 'DfE’s average of the last three years (pupils pooled), steadier than one year for a school with few pupils. Only when the latest year is the newest published',
      source: 'ks2',
      year: 'ks2Year',
    },
    ks2RwmHigherAvg: { type: 'number', placement: 'detail', label: 'Higher standard, 3-year average (%)', source: 'ks2', year: 'ks2Year' },
    ks2Cohort3yr: { type: 'number', placement: 'detail', label: 'Pupils who took the KS2 tests over three years', source: 'ks2-info', year: 'ks2Year' },

    ks2ProgressYear: {
      type: 'string',
      placement: 'detail',
      label: 'KS2 progress year',
      description: 'Latest year KS2 progress was published (2022/23: later pupils had no key stage 1 results to measure from because of COVID)',
      source: 'ks2',
    },
    ks2ProgressBand: {
      type: 'enum',
      values: PROGRESS_BANDS,
      placement: 'mode',
      label: 'KS2 progress band',
      description:
        'Above or below average when most of the reading, writing and maths progress scores are clearly so (whole 95% confidence interval beyond zero) and none points the other way. Our own summary of the three DfE scores',
      source: 'ks2',
      year: 'ks2ProgressYear',
    },
    ks2ProgressMean: {
      type: 'number',
      placement: 'mode',
      label: 'KS2 progress, average of the three subjects',
      description: 'Mean of the reading, writing and maths progress scores (0 = average for pupils with the same KS1 results). Our own calculation',
      source: 'ks2',
      year: 'ks2ProgressYear',
    },
    ks2ReadProgress: { type: 'number', placement: 'detail', label: 'Reading progress score', source: 'ks2', year: 'ks2ProgressYear' },
    ks2ReadProgressLower: { type: 'number', placement: 'detail', label: 'Reading progress, lower 95% confidence limit', source: 'ks2', year: 'ks2ProgressYear' },
    ks2ReadProgressUpper: { type: 'number', placement: 'detail', label: 'Reading progress, upper 95% confidence limit', source: 'ks2', year: 'ks2ProgressYear' },
    ks2WriteProgress: { type: 'number', placement: 'detail', label: 'Writing progress score', source: 'ks2', year: 'ks2ProgressYear' },
    ks2WriteProgressLower: { type: 'number', placement: 'detail', label: 'Writing progress, lower 95% confidence limit', source: 'ks2', year: 'ks2ProgressYear' },
    ks2WriteProgressUpper: { type: 'number', placement: 'detail', label: 'Writing progress, upper 95% confidence limit', source: 'ks2', year: 'ks2ProgressYear' },
    ks2MathsProgress: { type: 'number', placement: 'detail', label: 'Maths progress score', source: 'ks2', year: 'ks2ProgressYear' },
    ks2MathsProgressLower: { type: 'number', placement: 'detail', label: 'Maths progress, lower 95% confidence limit', source: 'ks2', year: 'ks2ProgressYear' },
    ks2MathsProgressUpper: { type: 'number', placement: 'detail', label: 'Maths progress, upper 95% confidence limit', source: 'ks2', year: 'ks2ProgressYear' },
  },

  async build(ctx) {
    const ks2 = await loadKs2(ctx.dataPath('ks2'), ctx.dataPath('ks2-info'));
    const years = [...new Set([...ks2.values()].flatMap((s) => [...s.years.keys()]))].sort().reverse();
    ctx.log(`KS2: ${ks2.size} schools, years ${years.join(', ')}`);
    const inScope = ctx.schools.all.filter((s) => ks2.has(s.urn));
    const round = ctx.stats.round;

    // Percentile within each year among state-funded mainstream schools (all primaries here are mainstream)
    const rankers = (pick: (y: Ks2Year) => number | null) => {
      const byYear = new Map<string, (v: number) => number>();
      for (const label of years) {
        const population = inScope.flatMap((s): [number, number][] => {
          const v = ks2.get(s.urn)!.years.get(label);
          const value = v ? pick(v) : null;
          return value === null ? [] : [[s.urn, value]];
        });
        if (population.some(([urn]) => ctx.schools.isState(urn))) byYear.set(label, ctx.stats.percentileAmongState(population));
      }
      return byYear;
    };
    const expectedRank = rankers((y) => y.rwmExpected);
    const higherRank = rankers((y) => y.rwmHigher);

    const rows = [];
    for (const { urn, sector } of inScope) {
      const k = ks2.get(urn)!;
      const [ks2Year, y] = latestWith(k, years, (v) => v.rwmExpected !== null) ?? [null, null];
      const at = ks2Year ? years.indexOf(ks2Year) : -1;
      const older = (n: number) => (at >= 0 ? (k.years.get(years[at + n]) ?? null) : null);
      const [prev, prev2] = [older(1), older(2)];
      const [progressYear, p] = latestWith(k, years, (v) => SUBJECTS.some((s) => v.subjects[s].progress !== null)) ?? [null, null];
      const scores = p ? SUBJECTS.map((s) => p.subjects[s]) : [];
      const band = progressBand(scores.map((s) => ({ score: s.progress, lower: s.progressLower, upper: s.progressUpper })));
      const known = scores.flatMap((s) => (s.progress === null ? [] : [s.progress]));
      // The three-year average is for the newest year published; it only suits a school whose latest result is that year
      const average = k.average && k.average.year === ks2Year ? k.average : null;
      const state = sector === 'state';

      const [read, write, maths] = [y?.subjects.Reading, y?.subjects.Writing, y?.subjects.Maths];
      const [readP, writeP, mathsP] = [p?.subjects.Reading, p?.subjects.Writing, p?.subjects.Maths];
      rows.push({
        urn,
        ks2Year,
        ks2Cohort: y?.cohort ?? null,
        ks2RwmExpected: y?.rwmExpected ?? null,
        ks2RwmHigher: y?.rwmHigher ?? null,
        ks2RwmExpectedPct: y?.rwmExpected != null && state && ks2Year ? (expectedRank.get(ks2Year)?.(y.rwmExpected) ?? null) : null,
        ks2RwmHigherPct: y?.rwmHigher != null && state && ks2Year ? (higherRank.get(ks2Year)?.(y.rwmHigher) ?? null) : null,
        ks2ReadScore: y?.subjects.Reading.score ?? null,
        ks2MathsScore: y?.subjects.Maths.score ?? null,
        ks2RwmExpectedPrev: prev?.rwmExpected ?? null,
        ks2RwmExpectedPrev2: prev2?.rwmExpected ?? null,
        ks2RwmHigherPrev: prev?.rwmHigher ?? null,
        ks2RwmHigherPrev2: prev2?.rwmHigher ?? null,
        ks2CohortPrev: prev?.cohort ?? null,
        ks2CohortPrev2: prev2?.cohort ?? null,
        ks2RwmExpectedAvg: average?.expected ?? null,
        ks2RwmHigherAvg: average?.higher ?? null,
        ks2Cohort3yr: average ? k.cohort3yr : null,
        ks2ProgressYear: progressYear,
        ks2ProgressBand: band,
        ks2ProgressMean: known.length > 0 ? round(ctx.stats.mean(known), 1) : null,
        ks2ReadExpected: read?.expected ?? null,
        ks2ReadHigher: read?.higher ?? null,
        ks2ReadProgress: readP?.progress ?? null,
        ks2ReadProgressLower: readP?.progressLower ?? null,
        ks2ReadProgressUpper: readP?.progressUpper ?? null,
        ks2WriteExpected: write?.expected ?? null,
        ks2WriteHigher: write?.higher ?? null,
        ks2WriteProgress: writeP?.progress ?? null,
        ks2WriteProgressLower: writeP?.progressLower ?? null,
        ks2WriteProgressUpper: writeP?.progressUpper ?? null,
        ks2MathsExpected: maths?.expected ?? null,
        ks2MathsHigher: maths?.higher ?? null,
        ks2MathsProgress: mathsP?.progress ?? null,
        ks2MathsProgressLower: mathsP?.progressLower ?? null,
        ks2MathsProgressUpper: mathsP?.progressUpper ?? null,
      });
    }

    // What a typical state primary gets, for the popup: the median of the newest year's figures
    const newest = years.find((label) => expectedRank.has(label)) ?? null;
    const median = (pick: (y: Ks2Year) => number | null) => {
      const pairs = inScope.flatMap((s): [number, number][] => {
        const v = newest ? ks2.get(s.urn)!.years.get(newest) : undefined;
        const value = v ? pick(v) : null;
        return value === null ? [] : [[s.urn, value]];
      });
      return round(ctx.stats.nationalMedianAmongState(pairs), 1);
    };
    const medians: Record<string, number | null> = {
      ks2MedianRwmExpected: median((y) => y.rwmExpected),
      ks2MedianRwmHigher: median((y) => y.rwmHigher),
      ks2MedianReadScore: median((y) => y.subjects.Reading.score),
      ks2MedianMathsScore: median((y) => y.subjects.Maths.score),
    };
    for (const s of SUBJECTS) {
      medians[`ks2Median${KEY[s]}Expected`] = median((y) => y.subjects[s].expected);
      medians[`ks2Median${KEY[s]}Higher`] = median((y) => y.subjects[s].higher);
    }
    ctx.log(`${rows.filter((r) => r.ks2Year !== null).length} schools with KS2 results, ${rows.filter((r) => r.ks2ProgressBand !== null).length} with progress`);

    return {
      rows,
      metadata: { ks2Years: years, ks2Newest: newest, ks2ProgressYear: rows.map((r) => r.ks2ProgressYear as string | null).filter((v) => v !== null).sort().at(-1) ?? null, ...medians },
    };
  },
});
