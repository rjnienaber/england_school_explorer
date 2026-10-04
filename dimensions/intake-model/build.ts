// "Results vs intake": our own estimate of how a school's Attainment 8 compares with what is
// expected from its share of disadvantaged pupils. Not an official measure.
//
// For each year, Attainment 8 is fitted against % disadvantaged across non-selective state
// schools (grammar schools would skew it). A school's score is its actual Attainment 8 minus
// the fitted value, ranked among state schools.

import { defineDimension } from '../../lib/dimension.ts';

interface HistoryRow {
  urn: number;
  year: string;
  att8: number | null;
  disadvantagedPct: number | null;
}

export const module = defineDimension({
  id: 'intake-model',
  title: 'Results vs intake (estimate)',
  dependsOn: ['gias-core', 'ks4-headline'],
  fields: {
    att8VsIntake: {
      type: 'number',
      decimals: 1,
      placement: 'mode',
      label: 'Attainment 8 vs expected for intake',
      description: 'Attainment 8 minus the score predicted from the cohort\'s % disadvantaged. Our own estimate.',
      year: 'ks4Year',
    },
    att8VsIntakePct: {
      type: 'number',
      placement: 'mode',
      label: 'Results vs intake percentile',
      description: 'Percentile (0-100) of the above among state-funded mainstream schools',
      year: 'ks4Year',
    },
  },

  build(ctx) {
    const history = ctx.readExtra('ks4-headline', 'history') as unknown as HistoryRow[];
    const latestYear = ctx.read('ks4-headline');
    const years = [...new Set(history.map((h) => h.year))].sort().reverse();

    const models = new Map<string, { predict: (pct: number) => number; residualRank: (v: number) => number }>();
    for (const year of years) {
      const state = history.filter((h) => h.year === year && h.att8 !== null && ctx.schools.isState(h.urn));
      if (state.length === 0) continue;

      // Fit on non-selective schools so grammar schools don't skew the expected score
      const fitPoints = state
        .filter((h) => !ctx.schools.get(h.urn)!.selective && h.disadvantagedPct !== null)
        .map((h): [number, number] => [h.disadvantagedPct!, h.att8!]);
      const fit = ctx.stats.linearFit(fitPoints);
      const predict = (pct: number) => fit.intercept + fit.slope * pct;
      const residuals = state.filter((h) => h.disadvantagedPct !== null).map((h): [number, number] => [h.urn, h.att8! - predict(h.disadvantagedPct!)]);
      models.set(year, { predict, residualRank: ctx.stats.percentileAmongState(residuals) });
      ctx.log(`${year}: Att8 ≈ ${fit.intercept.toFixed(1)} ${fit.slope.toFixed(3)}×%disadvantaged (r = ${fit.r.toFixed(2)}, n = ${fitPoints.length})`);
    }

    // Score each state school's latest year
    const byUrnYear = new Map(history.map((h) => [`${h.urn}/${h.year}`, h]));
    const rows = [];
    for (const [urn, ks4] of latestYear) {
      const year = ks4.ks4Year as string | null;
      const model = year ? models.get(year) : undefined;
      const h = year ? byUrnYear.get(`${urn}/${year}`) : undefined;
      if (!model || !h || !ctx.schools.isState(urn) || h.att8 === null || h.disadvantagedPct === null) continue;
      const vsIntake = h.att8 - model.predict(h.disadvantagedPct);
      rows.push({ urn, att8VsIntake: vsIntake, att8VsIntakePct: model.residualRank(vsIntake) });
    }
    return rows;
  },
});
