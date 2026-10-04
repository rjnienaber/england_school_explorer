// What differs between the secondary and the primary comparison, as data: the measures, the wording, the links. The
// comparison itself (web-ui.ts) reads one of these and has no `if (primary)` of its own. Pure code (browser and tests).

import { MEASURES, PRIMARY_MEASURES, type MeasureDef, type MeasureGroup } from './measures.ts';
import { DEFAULT_PHASE, type Phase } from '../../lib/phase.ts';
import type { School } from '../../web/toolkit.ts';

/** A row of context figures in the table: shown for each school, with no verdict and no probability. */
export interface ContextRow {
  label: string;
  /** The text to show for a school, or null if it has no figure. */
  pick: (p: School) => string | null;
  /** The England average, from `compareAverages`: its key and the decimal places to show. */
  average?: { key: string; places: number };
}

export interface ComparePhase {
  phase: Phase;
  /** Where this phase's saved shortlist lives in localStorage (secondary keeps the key it always had). */
  storeKey: string;
  /** The measures, in table order. */
  measures: MeasureDef[];
  /** The order of the groups in the table. */
  groups: MeasureGroup[];
  /** Replacements for a group's note in this phase. */
  groupNotes: Partial<Record<MeasureGroup, string>>;
  /** The England averages shown as columns: which sets of `compareAverages`, and the column heading. */
  averageColumns: { set: 'state' | 'all'; heading: string }[];
  /** The footnote under the table, after the part about what "likely better" means. */
  averagesNote: string;
  /** Plain-wording warnings shown at the top of the comparison, before any figures. */
  caveats: string[];
  /** The closing "how far to trust this" paragraph. */
  trust: string;
  /** Rows of figures with no verdict. */
  context: ContextRow[];
  /** Where to apply, for the equal-preference note. */
  apply: { label: string; url: string };
  /** "Estimate where each might rank in England": needs whole-country columns that only secondary has. */
  nationalRank: boolean;
  /** "Compare like with like": needs the intake-based similar schools that only secondary has. */
  similarSchools: boolean;
}

const place = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const whole = (v: number) => String(Math.round(v));

/** The sentence that closes each phase's comparison: what the figures can and cannot say. */
const LEARN_FROM_VISITS = 'Use this to ask better questions on a visit, not to pick a winner.';

const SECONDARY: ComparePhase = {
  phase: 'secondary',
  storeKey: 'schools-shortlist',
  measures: MEASURES,
  groups: ['quality', 'results', 'pupils', 'inspection'],
  groupNotes: {},
  averageColumns: [
    { set: 'state', heading: 'England average, state-funded schools*' },
    { set: 'all', heading: 'England average, all schools*' },
  ],
  averagesNote:
    '* Our own calculation: the average of the schools on this map, weighted by the pupils each figure is based on. DfE’s official England figures cover some schools this map leaves out, so they differ a little.',
  caveats: [],
  trust: `Results largely reflect who a school admits. Progress 8 and “results vs intake” try to allow for that and are the only measures here that speak to the school itself. Even those are noisy: published research on school league tables (Goldstein and Spiegelhalter, 1996; Leckie and Goldstein, 2017) finds that a school’s past results predict a child’s own progress only loosely. ${LEARN_FROM_VISITS}`,
  context: [
    { label: 'Place among similar schools (Attainment 8)', pick: (p) => (p.similarAtt8Rank !== null && p.similarAtt8Of !== null ? `${place(p.similarAtt8Rank)} of ${p.similarAtt8Of}` : null) },
    { label: 'Suspensions per 100 pupils', pick: (p) => (p.suspensionRate !== null ? p.suspensionRate.toFixed(1) : null), average: { key: 'suspensionRate', places: 1 } },
  ],
  apply: { label: 'Apply for a secondary school place (GOV.UK)', url: 'https://www.gov.uk/apply-for-secondary-school-place' },
  nationalRank: true,
  similarSchools: true,
};

const PRIMARY: ComparePhase = {
  phase: 'primary',
  storeKey: 'schools-shortlist-primary',
  measures: PRIMARY_MEASURES,
  groups: ['results', 'progress', 'pupils', 'inspection'],
  groupNotes: {
    results:
      'The real results of the Year 6 pupils who sat the tests. They do not separate the school from who it admits, so a school in an advantaged area scores high whatever it adds, and a small year group can swing by several points.',
  },
  // Every school on the primary map is state-funded, so there is one set of averages
  averageColumns: [{ set: 'state', heading: 'England average, state-funded schools*' }],
  averagesNote:
    '* Our own calculation: the average of the state-funded primary schools on this map, weighted by the pupils each figure is based on (progress scores are a plain average of schools). DfE’s official England figures cover some schools this map leaves out, so they differ a little.',
  caveats: [
    'KS2 results mostly reflect who joins the school, not only teaching. There’s no up-to-date measure that adjusts for intake.',
    'Year 6 groups are small, often around 30 pupils, so one or two children can move a percentage by several points. Expect “no clear difference” often.',
  ],
  trust: `KS2 results mostly reflect who joins a school. The only measure here that allows for intake is KS2 progress, and DfE last published it for 2022/23. Even a school-effect measure is noisy: published research on school league tables (Goldstein and Spiegelhalter, 1996; Leckie and Goldstein, 2017) finds that a school’s past results predict a child’s own progress only loosely, and a primary year group is small. ${LEARN_FROM_VISITS}`,
  context: [
    { label: 'Pupils who took the KS2 tests', pick: (p) => (p.ks2Cohort !== null ? whole(p.ks2Cohort) : null) },
    { label: 'Expected standard, 3-year average (DfE)', pick: (p) => (p.ks2RwmExpectedAvg !== null ? `${whole(p.ks2RwmExpectedAvg)}%` : null), average: { key: 'rwmExpectedAvg', places: 0 } },
    { label: 'Reading: average scaled score', pick: (p) => (p.ks2ReadScore !== null ? whole(p.ks2ReadScore) : null), average: { key: 'readScore', places: 0 } },
    { label: 'Maths: average scaled score', pick: (p) => (p.ks2MathsScore !== null ? whole(p.ks2MathsScore) : null), average: { key: 'mathsScore', places: 0 } },
  ],
  apply: { label: 'Apply for a primary school place (GOV.UK)', url: 'https://www.gov.uk/apply-for-primary-school-place' },
  nationalRank: false,
  similarSchools: false,
};

export const COMPARE_PHASES: Record<Phase, ComparePhase> = { secondary: SECONDARY, primary: PRIMARY };

export const comparePhase = (phase: Phase = DEFAULT_PHASE): ComparePhase => COMPARE_PHASES[phase];
