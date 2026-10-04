// KS4 (GCSE) headline measures: Attainment 8 and its history, Progress 8 with confidence
// intervals, English and maths, EBacc, and the disadvantaged-pupil figures. Each school gets
// the latest year with an Attainment 8 score (Progress 8 can be an older year: it wasn't
// published for the 2024/25 and 2025/26 cohorts).

import { defineDimension } from '../../lib/dimension.ts';
import { P8_BANDS, p8Band } from './bands.ts';
import { loadKs4, type Ks4School, type Ks4Year } from './parse.ts';

function latestWith(ks4: Ks4School, years: string[], has: (y: Ks4Year) => boolean): [string, Ks4Year] | null {
  for (const label of years) {
    const year = ks4.years.get(label);
    if (year && has(year)) return [label, year];
  }
  return null;
}

export const module = defineDimension({
  id: 'ks4-headline',
  title: 'GCSE headline results (KS4)',
  dependsOn: ['gias-core'],
  fields: {
    ks4Year: { type: 'string', placement: 'detail', label: 'GCSE results year', description: 'Latest year with an Attainment 8 score', source: 'ks4' },
    ks4Cohort: { type: 'number', placement: 'detail', label: 'Pupils in year group', source: 'ks4', year: 'ks4Year' },
    disadvantagedPct: { type: 'number', placement: 'detail', label: 'Disadvantaged pupils (%)', source: 'ks4', year: 'ks4Year' },
    att8: { type: 'number', placement: 'mode', label: 'Attainment 8', description: 'Average GCSE score across eight subjects', source: 'ks4', year: 'ks4Year' },
    att8Prev: { type: 'number', placement: 'detail', label: 'Attainment 8, previous year', source: 'ks4' },
    att8Prev2: { type: 'number', placement: 'detail', label: 'Attainment 8, two years ago', source: 'ks4' },
    att8Avg: { type: 'number', decimals: 1, placement: 'detail', label: 'Attainment 8, average of up to 3 years', source: 'ks4' },
    att8Years: { type: 'number', placement: 'detail', label: 'Years in the Attainment 8 average', source: 'ks4', nullable: false, default: 0 },
    att8Disadvantaged: { type: 'number', placement: 'detail', label: 'Attainment 8 of disadvantaged pupils', source: 'ks4', year: 'ks4Year' },
    engMaths5: { type: 'number', placement: 'detail', label: 'English and maths grade 5+ (%)', source: 'ks4', year: 'ks4Year' },
    ebaccEntry: { type: 'number', placement: 'detail', label: 'Entering the EBacc (%)', source: 'ks4', year: 'ks4Year' },
    att8Pct: {
      type: 'number',
      placement: 'mode',
      label: 'Attainment 8 percentile',
      description: 'Percentile (0-100) of Attainment 8 among state-funded mainstream schools in the same year',
      source: 'ks4',
      year: 'ks4Year',
    },
    p8Year: { type: 'string', placement: 'detail', label: 'Progress 8 year', description: 'Latest year Progress 8 was published', source: 'ks4' },
    p8: { type: 'number', placement: 'core', label: 'Progress 8', source: 'ks4', year: 'p8Year' },
    p8Lower: { type: 'number', placement: 'detail', label: 'Progress 8, lower 95% confidence limit', source: 'ks4', year: 'p8Year' },
    p8Upper: { type: 'number', placement: 'detail', label: 'Progress 8, upper 95% confidence limit', source: 'ks4', year: 'p8Year' },
    p8Band: {
      type: 'enum',
      values: P8_BANDS,
      placement: 'core',
      label: 'Progress 8 band',
      description: 'Above or below average only when the whole confidence interval is',
      source: 'ks4',
      year: 'p8Year',
    },
  },

  extraTables: {
    history: {
      description: 'One row per school and academic year with Attainment 8 data, for every year in the source file',
      columns: { year: 'text', cohort: 'integer', att8: 'real', disadvantagedPct: 'real' },
    },
  },

  async build(ctx) {
    const ks4 = await loadKs4(ctx.dataPath('ks4'));
    const years = [...new Set([...ks4.values()].flatMap((s) => [...s.years.keys()]))].sort().reverse();
    ctx.log(`KS4: ${ks4.size} schools, years ${years.join(', ')}`);

    const inScope = ctx.schools.all.filter((s) => ks4.has(s.urn));

    // Percentile within each year, among state-funded mainstream schools only: independent
    // schools' scores aren't comparable (IGCSEs don't count towards Attainment 8).
    const att8Rankers = new Map<string, (v: number) => number>();
    for (const label of years) {
      const population = inScope.flatMap((s): [number, number][] => {
        const att8 = ks4.get(s.urn)!.years.get(label)?.att8;
        return att8 == null ? [] : [[s.urn, att8]];
      });
      if (population.some(([urn]) => ctx.schools.isState(urn))) att8Rankers.set(label, ctx.stats.percentileAmongState(population));
    }

    const rows = [];
    const history = [];
    for (const { urn, sector } of inScope) {
      const k = ks4.get(urn)!;
      const latest = latestWith(k, years, (y) => y.att8 !== null);
      const [ks4Year, y] = latest ?? [null, null];
      const att8History = years.map((label) => k.years.get(label)?.att8 ?? null);
      const latestIndex = ks4Year ? years.indexOf(ks4Year) : -1;
      const recentAtt8 = latestIndex >= 0 ? att8History.slice(latestIndex, latestIndex + 3) : [];
      const recentValues = recentAtt8.filter((v) => v !== null);

      const p8 = latestWith(k, years, (yr) => yr.p8 !== null && yr.p8Lower !== null && yr.p8Upper !== null);
      const [p8Year, p8Data] = p8 ?? [null, null];
      const ranker = ks4Year && sector === 'state' ? att8Rankers.get(ks4Year) : undefined;

      rows.push({
        urn,
        ks4Year,
        ks4Cohort: y?.cohort ?? null,
        disadvantagedPct: y?.disadvantagedPct ?? null,
        att8: y?.att8 ?? null,
        att8Prev: recentAtt8[1] ?? null,
        att8Prev2: recentAtt8[2] ?? null,
        att8Avg: ctx.stats.round(ctx.stats.mean(recentValues)),
        att8Years: recentValues.length,
        att8Disadvantaged: y?.att8Disadvantaged ?? null,
        engMaths5: y?.engMaths5 ?? null,
        ebaccEntry: y?.ebaccEntry ?? null,
        att8Pct: y?.att8 != null && ranker ? ranker(y.att8) : null,
        p8Year,
        p8: p8Data?.p8 ?? null,
        p8Lower: p8Data?.p8Lower ?? null,
        p8Upper: p8Data?.p8Upper ?? null,
        p8Band: p8Data ? p8Band(p8Data.p8!, p8Data.p8Lower!, p8Data.p8Upper!) : null,
      });

      for (const [year, v] of k.years) {
        history.push({ urn, year, cohort: v.cohort, att8: v.att8, disadvantagedPct: v.disadvantagedPct });
      }
    }

    const p8Years = rows.map((r) => r.p8Year).filter((v) => v !== null);
    return {
      rows,
      extra: { history },
      metadata: { ks4Years: years, p8Year: p8Years.sort().at(-1) ?? null },
    };
  },
});
