import { fmt, signed, type Metadata, type ModeDef, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';
import { VA_BANDS, type VaBand } from './grades.ts';

const year = (meta: Metadata) => (meta.ks5Year as string | null | undefined) ?? null;

const BAND_LABELS: Record<VaBand, string> = {
  'well-above': 'Well above average progress',
  above: 'Above average progress',
  average: 'Average progress',
  below: 'Below average progress',
  'well-below': 'Well below average progress',
};
const BAND_SHORT: Record<VaBand, string> = {
  'well-above': 'Well above average',
  above: 'Above average',
  average: 'Average',
  below: 'Below average',
  'well-below': 'Well below average',
};
const BAND_COLOURS: Record<VaBand, number> = { 'well-above': 4, above: 3, average: 2, below: 1, 'well-below': 0 };

export const modes: ModeDef[] = [
  {
    id: 'sixth-form',
    label: 'Sixth form progress',
    order: 130,
    // The bands are DfE's: above or below average only where the whole confidence interval is
    description: (meta) =>
      `How much progress students make at A level (${year(meta) ?? 'latest year'}), compared with students who got the same GCSE results elsewhere. ` +
      'These are the Department for Education\'s own bands, and a school is only above or below average when the evidence is clear. ' +
      'Schools without a sixth form are shown as "No sixth form". Schools with a sixth form but too few A level students, or no published figure, are "No data". ' +
      'State-funded schools only.',
    buckets: [
      ...VA_BANDS.map((b) => ({ label: BAND_SHORT[b], colour: BAND_COLOURS[b] })),
      { label: 'No sixth form', colour: -2 },
    ],
    bucketOf: (p) => (p.alevelVaBand ? VA_BANDS.indexOf(p.alevelVaBand) : p.sixthForm ? null : VA_BANDS.length),
    // Schools without a progress figure are left out of the ranked list
    sortValue: (p) => (p.alevelVaBand ? 4 - VA_BANDS.indexOf(p.alevelVaBand) : null),
    formatValue: (p) => (p.alevelVaBand ? BAND_SHORT[p.alevelVaBand] : p.sixthForm ? '–' : 'No sixth form'),
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'sixth-form',
    order: 25,
    title: (p) => `Sixth form${p.ks5Year ? ` (${p.ks5Year})` : ''}`,
    render(p, h, _extra, meta) {
      const typical = (value: string | number | null | undefined, digits = 0) =>
        value === null || value === undefined ? null : typeof value === 'number' ? fmt(value, digits, '%') : value;
      const lines: [string, string | null, string | null][] = [
        ['Average A level grade', p.alevelGrade, typical(meta?.alevelMedianGrade as string | null)],
        ['Best three A levels', p.alevelBest3Grade, typical(meta?.alevelMedianBest3Grade as string | null)],
        ['Students with AAB or better', p.alevelAabPct === null ? null : fmt(p.alevelAabPct, 0, '%'), typical(meta?.alevelMedianAabPct as number | null)],
        ['Stayed to the end of their courses', p.sixthRetainedPct === null ? null : fmt(p.sixthRetainedPct, 0, '%'), typical(meta?.sixthMedianRetainedPct as number | null)],
      ];
      // A suppressed or missing figure hides its row rather than showing a dash
      const shown = lines.filter(([, value]) => value !== null);
      const hasProgress = p.alevelVa !== null && p.alevelVaLower !== null && p.alevelVaUpper !== null && p.alevelVaBand !== null;
      if (shown.length === 0 && !hasProgress) return null;

      const table = shown.length === 0 ? null : h.table(['', 'This school', 'Typical secondary'], shown);
      const progress = !hasProgress
        ? null
        : h.html`${h.rows([[BAND_LABELS[p.alevelVaBand!], signed(p.alevelVa!, 2)]])}${h.ciChart({
            value: p.alevelVa!,
            lower: p.alevelVaLower!,
            upper: p.alevelVaUpper!,
            min: -1.5,
            max: 1.5,
            name: 'A level value added',
            zeroLabel: '0 = average',
          })}`;
      const students =
        p.alevelStudents === null ? null : h.note(`Based on ${p.alevelStudents.toLocaleString('en-GB')} students. In a small sixth form one student moves each figure by a point or more.`);
      return h.html`${table}${progress}${h.note('Progress compares students with others who had the same GCSE results, in grades per A level entry. The line shows the range the true figure is likely to lie in. Typical is the median state secondary with a sixth form. Sixth forms vary a lot in size and entry requirements, so compare like with like.')}${students}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'ks5',
    order: 94,
    about: (meta, h) => h.html`${h.sourceLink('ks5', 'DfE A level and other 16 to 18 results')}${year(meta) ? h.html` (${year(meta)})` : ''}`,
    dates: (meta) => [year(meta) && `Sixth form results ${year(meta)}`],
  },
];
