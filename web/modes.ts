import type { OfstedSummary, P8Band, SchoolProperties } from '../shared/school.ts';

export type ModeId = 'p8' | 'intake' | 'att8' | 'ofsted';
export type Theme = 'light' | 'dark';

// Diverging red ↔ grey ↔ blue. Each arm steps monotonically in lightness and was
// checked with the dataviz palette validator. Dark mode flips the anchor so the
// extremes are the brightest marks on the dark basemap.
export const PALETTE: Record<Theme, string[]> = {
  light: ['#c43a3a', '#ef9a93', '#d4d3ce', '#86b6ef', '#1c5cab'],
  dark: ['#f2a7a1', '#b5504e', '#5a5955', '#2a78d6', '#9ec5f4'],
};

export interface Bucket {
  label: string;
  /** Index into PALETTE */
  colour: number;
}

export interface Mode {
  id: ModeId;
  name: string;
  description: (meta: { p8Year: string | null; ks4Year: string | null }) => string;
  /** Legend order: best first. */
  buckets: Bucket[];
  /** Which bucket a school falls into, or null if it has no value. */
  bucketOf: (p: SchoolProperties) => number | null;
  /** Numeric value to rank schools by in the list (higher is better). */
  sortValue: (p: SchoolProperties) => number | null;
  /** Short value shown in the list and hover tip. */
  formatValue: (p: SchoolProperties) => string;
}

const QUINTILES: Bucket[] = [
  { label: 'Top 20%', colour: 4 },
  { label: '60–80th percentile', colour: 3 },
  { label: '40–60th percentile', colour: 2 },
  { label: '20–40th percentile', colour: 1 },
  { label: 'Bottom 20%', colour: 0 },
];

const quintile = (pct: number | null) => (pct === null ? null : 4 - Math.min(4, Math.floor(pct / 20)));

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const signed = (n: number, places: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(places);

const P8_ORDER: P8Band[] = ['well-above', 'above', 'average', 'below', 'well-below'];
export const P8_LABELS: Record<P8Band, string> = {
  'well-above': 'Well above average',
  above: 'Above average',
  average: 'Average',
  below: 'Below average',
  'well-below': 'Well below average',
};

const OFSTED_ORDER: OfstedSummary[] = ['top', 'good', 'concern', 'serious'];
export const OFSTED_LABELS: Record<OfstedSummary, string> = {
  top: 'Outstanding, or mostly Strong/Exceptional',
  good: 'Good / Expected standard',
  concern: 'Requires improvement / Needs attention',
  serious: 'Inadequate / Urgent improvement',
};
const OFSTED_SHORT: Record<OfstedSummary, string> = {
  top: 'Outstanding',
  good: 'Good',
  concern: 'Needs improving',
  serious: 'Serious concern',
};
const OFSTED_COLOURS: Record<OfstedSummary, number> = { top: 4, good: 3, concern: 1, serious: 0 };

export const MODES: Mode[] = [
  {
    id: 'p8',
    name: 'Progress 8',
    description: ({ p8Year }) =>
      `Progress from age 11 to GCSE compared with pupils nationally who started from the same point (${p8Year ?? 'latest'}). ` +
      'Bands follow DfE: a school is only above or below average if its whole 95% confidence interval is. ' +
      'Not published for 2024/25 or 2025/26, because those pupils sat no KS2 tests during COVID.',
    buckets: P8_ORDER.map((b, i) => ({ label: P8_LABELS[b], colour: 4 - i })),
    bucketOf: (p) => (p.p8Band ? P8_ORDER.indexOf(p.p8Band) : null),
    sortValue: (p) => p.p8,
    formatValue: (p) => (p.p8 === null ? '–' : signed(p.p8, 2)),
  },
  {
    id: 'intake',
    name: 'Results vs intake',
    description: ({ ks4Year }) =>
      `Attainment 8 (${ks4Year ?? 'latest'}) compared with the score expected for a school with the same share of ` +
      'disadvantaged pupils, ranked among state schools. This is our own estimate, not an official measure. ' +
      'Grammar schools score highly by design because their intake is selected on ability.',
    buckets: QUINTILES,
    bucketOf: (p) => quintile(p.att8VsIntakePct),
    sortValue: (p) => p.att8VsIntake,
    formatValue: (p) => (p.att8VsIntake === null ? '–' : signed(p.att8VsIntake, 1)),
  },
  {
    id: 'att8',
    name: 'Attainment 8',
    description: ({ ks4Year }) =>
      `Average GCSE score across eight subjects (${ks4Year ?? 'latest'}), as a percentile among state schools. ` +
      'Raw results largely reflect who a school admits, so compare with "Results vs intake". ' +
      'Independent schools aren’t ranked: IGCSEs don’t count towards this measure.',
    buckets: QUINTILES,
    bucketOf: (p) => quintile(p.att8Pct),
    sortValue: (p) => p.att8,
    formatValue: (p) => (p.att8 === null ? '–' : p.att8.toFixed(1) + (p.att8Pct !== null ? ` · ${ordinal(p.att8Pct)}` : '')),
  },
  {
    id: 'ofsted',
    name: 'Ofsted',
    description: () =>
      'Latest inspection. Since November 2025, schools get report cards graded in several areas, not one overall grade. ' +
      'Report cards here are summarised by their lowest area grade (or "mostly Strong" when at least half the areas are Strong or Exceptional). ' +
      'This is our simplification. Older grades may be many years old.',
    buckets: OFSTED_ORDER.map((s) => ({ label: OFSTED_LABELS[s], colour: OFSTED_COLOURS[s] })),
    bucketOf: (p) => (p.ofstedSummary ? OFSTED_ORDER.indexOf(p.ofstedSummary) : null),
    sortValue: (p) => (p.ofstedSummary ? 3 - OFSTED_ORDER.indexOf(p.ofstedSummary) : null),
    formatValue: (p) => (p.ofstedSummary ? OFSTED_SHORT[p.ofstedSummary] : '–'),
  },
];

export const modeById = (id: string): Mode => MODES.find((m) => m.id === id) ?? MODES[0];
