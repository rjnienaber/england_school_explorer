// "Results vs intake": our own estimate of how a school's Attainment 8 compares with what is
// expected from its intake. Not an official measure.
//
// For each year, Attainment 8 is fitted (multiple linear regression) against the intake factors
// we have for every school, across non-selective state schools (grammar schools would skew it):
// % disadvantaged pupils, % with English as an additional language, the share of low and high
// prior attainers, and whether the school is girls-only or boys-only. A school's score is its
// actual Attainment 8 minus the fitted value, ranked among state schools. Schools missing an
// input fall back to a simpler model rather than being dropped. See model.ts.

import { defineDimension } from '../../lib/dimension.ts';
import { median } from '../../lib/stats.ts';
import { DEFAULT_PUPIL_SD, MODEL_IDS, fitModels, scoreSchool, type FittedModel, type Inputs } from './model.ts';

interface HistoryRow {
  urn: number;
  year: string;
  cohort: number | null;
  att8: number | null;
  disadvantagedPct: number | null;
}

const number = (v: unknown) => (typeof v === 'number' ? v : null);

export const module = defineDimension({
  id: 'intake-model',
  title: 'Results vs intake (estimate)',
  dependsOn: ['gias-core', 'ks4-headline', 'census', 'ks4-prior-attainment'],
  fields: {
    att8VsIntake: {
      type: 'number',
      decimals: 1,
      placement: 'mode',
      label: 'Attainment 8 vs expected for intake',
      description:
        'Attainment 8 minus the score expected for the school\'s intake, in Attainment 8 points (positive = better than expected). ' +
        'The expected score comes from a regression across non-selective state-funded mainstream schools in the same year on the share of disadvantaged pupils, ' +
        'the share with English as an additional language, the share of low and high prior attainers and whether the school is girls-only or boys-only. ' +
        'Our own estimate, not an official measure; intake differences it cannot see (such as selection by ability) end up in the score',
      year: 'ks4Year',
    },
    att8VsIntakePct: {
      type: 'number',
      placement: 'mode',
      label: 'Results vs intake percentile',
      description: 'Percentile (0-100) of the above among state-funded mainstream schools',
      year: 'ks4Year',
    },
    att8VsIntakeSe: {
      type: 'number',
      decimals: 2,
      placement: 'detail',
      label: 'Results vs intake, standard error',
      description:
        'Standard error of "Attainment 8 vs expected for intake", in Attainment 8 points: how much it could differ by chance. ' +
        'It combines chance variation in a year group\'s average (about 14.5 points divided by the square root of the pupils in the year group) ' +
        'and uncertainty in the expected score. It does not include intake differences the model cannot see, so treat it as a minimum. ' +
        'Roughly, the true value is within 2 standard errors of the figure about 95 times in 100',
      year: 'ks4Year',
    },
    att8IntakeModel: {
      type: 'enum',
      values: MODEL_IDS,
      placement: 'detail',
      label: 'Results vs intake, model used',
      description:
        '"full" uses disadvantaged %, English as an additional language %, prior attainment mix and girls-only/boys-only. ' +
        '"no-prior" leaves out prior attainment (the school has none published), and "basic" uses disadvantaged % alone',
      year: 'ks4Year',
    },
  },

  build(ctx) {
    const history = ctx.readExtra('ks4-headline', 'history') as unknown as HistoryRow[];
    const headline = ctx.read('ks4-headline');
    const census = ctx.read('census');
    const prior = ctx.read('ks4-prior-attainment');
    const gias = ctx.read('gias-core');
    const years = [...new Set(history.map((h) => h.year))].sort().reverse();

    // What each school looked like in each year. Census and prior attainment have one year only,
    // so they stand in for the older and newer cohorts: a school's pupil mix changes slowly. The
    // prior-attainment mix needs KS2 results, which the 2024/25 cohort never sat, so for them it
    // is the mix of the last cohort that did.
    const inputs = (h: HistoryRow): Inputs => ({
      urn: h.urn,
      att8: h.att8!,
      cohort: h.cohort,
      disadvantagedPct: h.disadvantagedPct,
      ealPct: number(census.get(h.urn)?.ealPctAll),
      priorLowPct: number(prior.get(h.urn)?.priorLowPct),
      priorHighPct: number(prior.get(h.urn)?.priorHighPct),
      gender: typeof gias.get(h.urn)?.gender === 'string' ? (gias.get(h.urn)!.gender as string) : null,
    });

    // How much one pupil's Attainment 8 varies around their school's average. DfE's Progress 8
    // confidence intervals imply it (interval half-width = 1.96 × spread / √pupils, and Progress 8
    // points are Attainment 8 points ÷ 10). It is almost the same for every school (about 14.5).
    const cohortOf = new Map(history.map((h) => [`${h.urn}/${h.year}`, h.cohort]));
    const spreads: number[] = [];
    for (const [urn, k] of headline) {
      const lower = number(k.p8Lower);
      const upper = number(k.p8Upper);
      const cohort = cohortOf.get(`${urn}/${k.p8Year}`);
      if (lower !== null && upper !== null && cohort && ctx.schools.isState(urn)) spreads.push(10 * ((upper - lower) / 3.92) * Math.sqrt(cohort));
    }
    const pupilSd = ctx.stats.round(median(spreads) ?? DEFAULT_PUPIL_SD, 2)!;
    ctx.log(`pupil-level spread of Attainment 8 ≈ ${pupilSd} points (from ${spreads.length} schools' Progress 8 intervals)`);

    const yearModels = new Map<string, { models: FittedModel[]; rank: (v: number) => number }>();
    for (const year of years) {
      const state = history.filter((h) => h.year === year && h.att8 !== null && ctx.schools.isState(h.urn)).map(inputs);
      if (state.length === 0) continue;

      // Fit on non-selective schools so grammar schools don't skew the expected score
      const models = fitModels(state.filter((i) => !ctx.schools.get(i.urn)!.selective));
      if (models.length === 0) continue;
      const residuals = state.flatMap((i): [number, number][] => {
        const score = scoreSchool(models, i, pupilSd);
        return score ? [[i.urn, score.residual]] : [];
      });
      yearModels.set(year, { models, rank: ctx.stats.percentileAmongState(residuals) });

      for (const m of models) {
        const terms = m.predictors.map((p, j) => `${m.fit.coefficients[j] >= 0 ? '+' : '−'} ${Math.abs(m.fit.coefficients[j]).toFixed(3)}×${p.id}`).join(' ');
        ctx.log(
          `${year} ${m.id.padEnd(8)} n = ${m.fit.n}, R² ${m.baselineR2.toFixed(3)} (disadvantaged only, same schools) → ${m.fit.r2.toFixed(3)}, ` +
            `adj ${m.fit.adjR2.toFixed(3)}, residual SE ${m.fit.rse.toFixed(2)}: Att8 ≈ ${m.fit.intercept.toFixed(2)} ${terms}`,
        );
      }
    }

    // Score each state school's latest year
    const byUrnYear = new Map(history.map((h) => [`${h.urn}/${h.year}`, h]));
    const rows = [];
    const used = new Map<string, number>();
    for (const [urn, ks4] of headline) {
      const year = ks4.ks4Year as string | null;
      const model = year ? yearModels.get(year) : undefined;
      const h = year ? byUrnYear.get(`${urn}/${year}`) : undefined;
      if (!model || !h || !ctx.schools.isState(urn) || h.att8 === null) continue;
      const score = scoreSchool(model.models, inputs(h), pupilSd);
      if (!score) continue;
      used.set(score.model, (used.get(score.model) ?? 0) + 1);
      rows.push({
        urn,
        att8VsIntake: score.residual,
        att8VsIntakePct: model.rank(score.residual),
        att8VsIntakeSe: score.se,
        att8IntakeModel: score.model,
      });
    }
    ctx.log(`scored ${rows.length} schools: ${[...used].map(([id, n]) => `${n} by ${id}`).join(', ')}`);

    // What the browser (and the README) say about the model: the latest year's full model
    const latest = years.find((y) => yearModels.has(y));
    const summary = latest
      ? yearModels.get(latest)!.models.map((m) => ({
          id: m.id,
          schools: m.fit.n,
          r2: ctx.stats.round(m.fit.r2, 3),
          r2DisadvantagedOnly: ctx.stats.round(m.baselineR2, 3),
          residualSe: ctx.stats.round(m.fit.rse, 2),
          intercept: ctx.stats.round(m.fit.intercept, 3),
          predictors: m.predictors.map((p, j) => ({
            id: p.id,
            coefficient: ctx.stats.round(m.fit.coefficients[j], 4),
            standardised: ctx.stats.round(m.fit.standardised[j], 3),
          })),
        }))
      : [];
    return { rows, metadata: { intakeModel: { year: latest ?? null, pupilSd, models: summary } } };
  },
});
