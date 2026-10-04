// The statistics behind "results vs intake", kept free of the build framework so it can be tested
// on its own. See build.ts for how the inputs are gathered and README "How schools are compared"
// for the plain-English version.

import { multipleFit, type MultipleFit } from '../../lib/stats.ts';

/** What the model knows about one school in one year. Missing values are null. */
export interface Inputs {
  urn: number;
  att8: number;
  /** Pupils in the GCSE year group: sets how much chance variation there is in the school's average. */
  cohort: number | null;
  disadvantagedPct: number | null;
  /** English as an additional language, whole school (%), from the school census. */
  ealPct: number | null;
  /** Share (%) of the year group who were low or high attainers at the end of primary school. */
  priorLowPct: number | null;
  priorHighPct: number | null;
  gender: string | null;
}

export interface Predictor {
  id: string;
  label: string;
  value(i: Inputs): number | null;
}

const girls = (i: Inputs) => (i.gender === null ? null : +(i.gender === 'Girls'));
const boys = (i: Inputs) => (i.gender === null ? null : +(i.gender === 'Boys'));

const DISADVANTAGED: Predictor = { id: 'disadvantaged', label: 'Disadvantaged pupils (%)', value: (i) => i.disadvantagedPct };
const EAL: Predictor = { id: 'eal', label: 'English as an additional language (%)', value: (i) => i.ealPct };
const PRIOR_LOW: Predictor = { id: 'priorLow', label: 'Low prior attainers (%)', value: (i) => i.priorLowPct };
const PRIOR_HIGH: Predictor = { id: 'priorHigh', label: 'High prior attainers (%)', value: (i) => i.priorHighPct };
const GIRLS: Predictor = { id: 'girlsSchool', label: 'Girls-only school', value: girls };
const BOYS: Predictor = { id: 'boysSchool', label: 'Boys-only school', value: boys };

/** The models, richest first. A school gets the richest one for which every predictor is known. */
export const MODEL_SPECS = [
  { id: 'full', label: 'Full', predictors: [DISADVANTAGED, EAL, PRIOR_LOW, PRIOR_HIGH, GIRLS, BOYS] },
  { id: 'no-prior', label: 'Without prior attainment', predictors: [DISADVANTAGED, EAL, GIRLS, BOYS] },
  // The original single-factor model, kept as the last resort
  { id: 'basic', label: 'Disadvantaged pupils only', predictors: [DISADVANTAGED] },
] as const satisfies readonly { id: string; label: string; predictors: Predictor[] }[];

export type ModelId = (typeof MODEL_SPECS)[number]['id'];
export const MODEL_IDS = MODEL_SPECS.map((m) => m.id) as readonly ModelId[];

/** Fewest schools per predictor before a model is fitted at all (only small test extracts ever hit this). */
const MIN_ROWS_PER_PREDICTOR = 5;

/** Typical spread of one pupil's Attainment 8 around a school's average, if it can't be measured: see `pupilSd` in build.ts. */
export const DEFAULT_PUPIL_SD = 14.5;

export interface FittedModel {
  id: ModelId;
  label: string;
  predictors: Predictor[];
  fit: MultipleFit;
  /** R² of the original single-factor model on exactly the schools this model was fitted on. */
  baselineR2: number;
}

const rowOf = (predictors: readonly Predictor[], i: Inputs): number[] | null => {
  const row: number[] = [];
  for (const p of predictors) {
    const v = p.value(i);
    if (v === null) return null;
    row.push(v);
  }
  return row;
};

/** Fits every model that has enough schools. `fitSchools` should already be the non-selective state schools. */
export function fitModels(fitSchools: Inputs[]): FittedModel[] {
  const fitted: FittedModel[] = [];
  for (const spec of MODEL_SPECS) {
    const sample = fitSchools.flatMap((i) => {
      const row = rowOf(spec.predictors, i);
      return row ? [{ i, row }] : [];
    });
    if (sample.length < MIN_ROWS_PER_PREDICTOR * spec.predictors.length || sample.length <= spec.predictors.length + 1) continue;
    const y = sample.map(({ i }) => i.att8);
    let fit: MultipleFit;
    try {
      fit = multipleFit(sample.map(({ row }) => row), y);
    } catch {
      continue; // e.g. a predictor that never varies in this year's data
    }
    const baseline = multipleFit(sample.map(({ i }) => [i.disadvantagedPct!]), y);
    fitted.push({ id: spec.id, label: spec.label, predictors: [...spec.predictors], fit, baselineR2: baseline.r2 });
  }
  return fitted;
}

export interface Score {
  model: ModelId;
  /** Attainment 8 minus the score expected for the school's intake. */
  residual: number;
  /** Standard error of `residual` in Attainment 8 points: see `scoreSchool`. */
  se: number;
}

/**
 * Scores one school with the richest model that has all its inputs; null if none does.
 *
 * residual = actual Attainment 8 − expected Attainment 8.
 *
 * se² = pupilSd² / cohort  +  rse² × leverage
 *   - the first term is chance variation: a year group is only a sample of the pupils the school
 *     could have had, so its average wobbles by about the pupils' spread divided by √cohort;
 *   - the second is uncertainty in the expected score itself (the fitted line is estimated from
 *     thousands of schools, so this is small, and bigger for schools unlike the typical one).
 * It does not cover intake differences the model cannot see, so it is a floor, not the whole story.
 */
export function scoreSchool(models: readonly FittedModel[], i: Inputs, pupilSd: number): Score | null {
  for (const m of models) {
    const row = rowOf(m.predictors, i);
    if (!row) continue;
    const sampling = i.cohort !== null && i.cohort > 0 ? pupilSd ** 2 / i.cohort : 0;
    const se = Math.sqrt(sampling + m.fit.rse ** 2 * m.fit.leverage(row));
    return { model: m.id, residual: i.att8 - m.fit.predict(row), se };
  }
  return null;
}
