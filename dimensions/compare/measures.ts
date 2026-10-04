// The measures a shortlist is compared on: where each comes from, which way is better, and how uncertain it is.
// Pure code (browser and tests). Fields are read from a school record that has its popup details loaded.

import { seFromCi, seOfPercent, type Reading } from './stats.ts';
import type { Metadata, School } from '../../web/toolkit.ts';

/**
 * Which kind of claim a measure supports. Wording follows it:
 * - quality: adjusted for intake, so "better" can be said of the school (Progress 8, results vs intake);
 * - results: raw results of the pupils at this school, which largely reflect who they are;
 * - pupils: absence and suspensions, which describe the pupils' experience, not intake-adjusted;
 * - inspection: Ofsted, an ordered grade with no probability.
 */
export type MeasureGroup = 'quality' | 'results' | 'pupils' | 'inspection';

export const GROUP_TITLES: Record<MeasureGroup, { title: string; note: string }> = {
  quality: {
    title: 'School effect (allowing for intake)',
    note: 'These try to separate the school from the pupils it admits, so they are the fairest basis for saying one school looks better than another.',
  },
  results: {
    title: 'Results of pupils at this school (largely reflect intake)',
    note: 'Exact for the pupils who sat the exams, but they do not separate the school from who it admits, so a selective or advantaged school scores high whatever it adds.',
  },
  pupils: {
    title: 'Attendance and behaviour',
    note: 'What happened to the pupils in the year. A higher or lower figure is not automatically the school’s doing.',
  },
  inspection: { title: 'Inspection', note: 'Ofsted grades are ordered categories, so there is no probability, only which is higher.' },
};

export interface MeasureDef {
  id: string;
  label: string;
  group: MeasureGroup;
  higherIsBetter: boolean;
  /** Shown in the weights and with the row: one plain sentence on what it is. */
  about: string;
  /** Counted in "beaten on every measure" and the suggested order until the person unticks it. */
  byDefault: boolean;
  /** Phrases for the verdict, after "Likely": "better progress" gives "Likely better progress". */
  words: { better: string; worse: string };
  /** The standard error covers chance variation only, so verdicts on it are weaker than they read. */
  chanceOnly: boolean;
  /** A grade with an order and no probability. */
  ordinal?: boolean;
  /** Writes a value for display: "+0.12", "46.1", "23.4%". */
  format: (value: number) => string;
  /** The school's value and standard error on this measure, or null if it has none. Needs the popup details loaded. */
  reading: (p: School, meta?: Metadata) => Reading | null;
  /** Data year of the school's figure, when it has one. */
  year: (p: School) => string | null;
  /**
   * Columns for every school, which the national rank band reads (loaded only when someone asks for it).
   * `value` and `se` are field names; the reading is the same one `reading` makes from a full record.
   * Absent where no whole-country column exists (the grade 4+ pass rates).
   */
  national?: { value: keyof School; se: keyof School | null };
  /** Percent measures are clamped to 0-100 when an interval is drawn. */
  isPercent?: boolean;
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const signed = (v: number, places: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(places);
const percent = (v: number) => `${v.toFixed(1)}%`;
const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);

/** How much one pupil's Attainment 8 varies around the school's average, from the intake model (about 14.5). */
export const pupilSdOf = (meta?: Metadata): number => {
  const sd = (meta?.intakeModel as { pupilSd?: number } | undefined)?.pupilSd;
  return typeof sd === 'number' && sd > 0 ? sd : 14.5;
};

/** An Attainment 8 average of `cohort` pupils: the chance spread of a mean. */
export const seOfAtt8 = (cohort: number, meta?: Metadata) => pupilSdOf(meta) / Math.sqrt(cohort);

/** A percentage of the year group, with its binomial standard error. */
const percentReading = (value: unknown, n: unknown): Reading | null => {
  const v = num(value);
  const count = num(n);
  if (v === null) return null;
  const se = count === null ? null : seOfPercent(v, count);
  return se === null ? null : { value: v, se };
};

export const OFSTED_RANK = { serious: 1, concern: 2, good: 3, top: 4 } as const;
export const OFSTED_LABELS: Record<number, string> = { 4: 'Outstanding', 3: 'Good', 2: 'Needs improving', 1: 'Serious concern' };

export const MEASURES: MeasureDef[] = [
  {
    id: 'p8',
    label: 'Progress 8',
    group: 'quality',
    higherIsBetter: true,
    about: 'How much pupils progressed from age 11 to 16 compared with similar pupils nationally. DfE’s official measure, with its own 95% confidence interval.',
    byDefault: true,
    words: { better: 'better progress', worse: 'worse progress' },
    chanceOnly: false,
    format: (v) => signed(v, 2),
    reading: (p) => {
      const v = num(p.p8);
      const lo = num(p.p8Lower);
      const hi = num(p.p8Upper);
      return v === null || lo === null || hi === null ? null : { value: v, se: seFromCi(lo, hi) };
    },
    year: (p) => str(p.p8Year),
    national: { value: 'p8', se: 'cmpP8Se' },
  },
  {
    id: 'intake',
    label: 'Results vs intake',
    group: 'quality',
    higherIsBetter: true,
    about: 'Attainment 8 minus the score expected for the school’s intake, in points. Our own estimate, not an official measure.',
    byDefault: true,
    words: { better: 'better results than expected for its intake', worse: 'worse results than expected for its intake' },
    chanceOnly: true,
    format: (v) => signed(v, 1),
    reading: (p) => {
      const v = num(p.att8VsIntake);
      const se = num(p.att8VsIntakeSe);
      return v === null || se === null ? null : { value: v, se };
    },
    year: (p) => str(p.ks4Year),
    national: { value: 'att8VsIntake', se: 'cmpIntakeSe' },
  },
  {
    id: 'att8',
    label: 'Attainment 8',
    group: 'results',
    higherIsBetter: true,
    about: 'Average GCSE score across eight subjects for pupils at this school.',
    byDefault: false,
    words: { better: 'higher results', worse: 'lower results' },
    chanceOnly: true,
    format: (v) => v.toFixed(1),
    reading: (p, meta) => {
      const v = num(p.att8);
      const n = num(p.ks4Cohort);
      return v === null || n === null || n <= 0 ? null : { value: v, se: seOfAtt8(n, meta) };
    },
    year: (p) => str(p.ks4Year),
    national: { value: 'att8', se: 'cmpAtt8Se' },
  },
  {
    id: 'engMaths5',
    label: 'English and maths grade 5+',
    group: 'results',
    higherIsBetter: true,
    about: 'Share of the year group with a strong pass (grade 5 or above) in both English and maths.',
    byDefault: false,
    words: { better: 'higher results', worse: 'lower results' },
    chanceOnly: true,
    isPercent: true,
    format: percent,
    reading: (p) => percentReading(p.engMaths5, p.ks4Cohort),
    year: (p) => str(p.ks4Year),
  },
  {
    id: 'engMaths4',
    label: 'English and maths grade 4+',
    group: 'results',
    higherIsBetter: true,
    about: 'Share of the year group with a standard pass (grade 4 or above) in both English and maths.',
    byDefault: false,
    words: { better: 'higher results', worse: 'lower results' },
    chanceOnly: true,
    isPercent: true,
    format: percent,
    reading: (p) => percentReading(p.engMaths4, p.ks4Cohort),
    year: (p) => str(p.passRatesYear),
  },
  {
    id: 'absence',
    label: 'Persistent absence',
    group: 'pupils',
    higherIsBetter: false,
    about: 'Share of pupils who missed one day in ten or more of school. Lower is better.',
    byDefault: true,
    words: { better: 'lower absence', worse: 'higher absence' },
    chanceOnly: true,
    isPercent: true,
    format: percent,
    reading: (p) => percentReading(p.absencePersistentPct, p.absencePupils),
    year: (p) => str(p.absenceYear),
    national: { value: 'absencePersistentPct', se: 'cmpAbsenceSe' },
  },
  {
    id: 'suspended',
    label: 'Pupils suspended',
    group: 'pupils',
    higherIsBetter: false,
    about: 'Share of pupils suspended at least once in the year. Lower is better, though some schools use suspension early to keep classrooms calm.',
    byDefault: true,
    words: { better: 'fewer pupils suspended', worse: 'more pupils suspended' },
    chanceOnly: true,
    isPercent: true,
    format: percent,
    reading: (p) => percentReading(p.suspendedPupilsPct, p.exclusionsPupils),
    year: (p) => str(p.exclusionsYear),
    national: { value: 'cmpSuspPct', se: 'cmpSuspSe' },
  },
  {
    id: 'ofsted',
    label: 'Ofsted',
    group: 'inspection',
    higherIsBetter: true,
    about: 'Our four-level summary of the latest Ofsted inspection. It is an order, not a measurement, so no probability is given.',
    byDefault: true,
    words: { better: 'a higher Ofsted grade', worse: 'a lower Ofsted grade' },
    chanceOnly: false,
    ordinal: true,
    format: (v) => OFSTED_LABELS[v] ?? '–',
    reading: (p) => {
      const level = p.ofstedSummary;
      return level ? { value: OFSTED_RANK[level], se: null } : null;
    },
    year: () => null,
    national: { value: 'ofstedSummary', se: null },
  },
];

export const measureById = (id: string): MeasureDef => MEASURES.find((m) => m.id === id)!;

/** Display interval (95%) for a reading, or null for an ordinal grade. Percentages stay within 0-100. */
export function intervalOf(m: MeasureDef, r: Reading): [number, number] | null {
  if (r.se === null) return null;
  const lo = r.value - 1.96 * r.se;
  const hi = r.value + 1.96 * r.se;
  return m.isPercent ? [Math.max(0, lo), Math.min(100, hi)] : [lo, hi];
}

/** Columns the national rank band needs for these measures (the value columns and the standard-error columns). */
export function nationalFields(ids: string[]): string[] {
  return ids.flatMap((id) => {
    const n = measureById(id).national;
    return n ? [n.value as string, ...(n.se ? [n.se as string] : [])] : [];
  });
}
