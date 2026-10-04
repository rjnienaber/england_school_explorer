import { P8_BANDS, P8_LABELS } from './bands.ts';
import { QUINTILES, fmt, ordinal, quintile, signed, type Metadata, type ModeDef, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const ks4Year = (meta: Metadata) => (meta.ks4Years as string[] | undefined)?.[0] ?? null;

export const modes: ModeDef[] = [
  {
    id: 'p8',
    label: 'Progress 8',
    order: 10,
    description: (meta) =>
      `Progress from age 11 to GCSE compared with pupils nationally who started from the same point (${(meta.p8Year as string | null) ?? 'latest'}). ` +
      'Bands follow DfE: a school is only above or below average if its whole 95% confidence interval is. ' +
      'Not published for 2024/25 or 2025/26, because those pupils sat no KS2 tests during COVID. ' +
      'For those years, "Results vs intake" is the nearest intake-adjusted measure (our own estimate, not DfE’s).',
    buckets: P8_BANDS.map((b, i) => ({ label: P8_LABELS[b], colour: 4 - i })),
    bucketOf: (p) => (p.p8Band ? P8_BANDS.indexOf(p.p8Band) : null),
    sortValue: (p) => p.p8,
    formatValue: (p) => (p.p8 === null ? '–' : signed(p.p8, 2)),
  },
  {
    id: 'att8',
    label: 'Attainment 8',
    order: 30,
    description: (meta) =>
      `Average GCSE score across eight subjects (${ks4Year(meta) ?? 'latest'}), as a percentile among state schools. ` +
      'Raw results largely reflect who a school admits, so compare with "Results vs intake". ' +
      'Independent schools aren’t ranked: IGCSEs don’t count towards this measure.',
    buckets: QUINTILES,
    bucketOf: (p) => quintile(p.att8Pct),
    sortValue: (p) => p.att8,
    formatValue: (p) => (p.att8 === null ? '–' : p.att8.toFixed(1) + (p.att8Pct !== null ? ` · ${ordinal(p.att8Pct)}` : '')),
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'progress8',
    group: 'results',
    order: 10,
    title: (p) => `Progress 8 ${p.p8Year ?? ''}`,
    render(p, h) {
      if (p.p8 === null || p.p8Lower === null || p.p8Upper === null || p.p8Band === null) return null;
      // Progress 8 stops at 2023/24, so the GCSE results below may be newer than it
      const older =
        p.ks4Year !== null && p.p8Year !== null && p.ks4Year !== p.p8Year
          ? h.note(`Progress 8 isn’t published for ${p.ks4Year} (those pupils sat no KS2 tests). “Vs expected for intake” below is our own estimate for that year.`)
          : null;
      return h.html`${h.rows([[P8_LABELS[p.p8Band], signed(p.p8, 2)]])}${older}${h.ciChart({
        value: p.p8,
        lower: p.p8Lower,
        upper: p.p8Upper,
        min: -1.5,
        max: 1.5,
        name: 'Progress 8',
        zeroLabel: '0 = national average',
      })}`;
    },
  },
  {
    // Other modules add rows with popupRows { section: 'gcse', slot: 'after-average' } (or no slot, for the end).
    // Slots: 'after-average', 'after-engmaths', 'after-ebacc'.
    id: 'gcse',
    group: 'results',
    order: 20,
    title: (p) => (p.att8 === null ? 'GCSE results' : `GCSE results ${p.ks4Year ?? ''}`),
    render(p, h, extra) {
      if (p.att8 === null) {
        return h.note('No published Attainment 8 score. It may be new, small (suppressed) or not entering GCSEs.');
      }
      const history = [p.att8Prev, p.att8Prev2].filter((v) => v !== null).map((v) => v.toFixed(1));
      const table = h.rows([
        ['Attainment 8', h.html`${fmt(p.att8)}${p.att8Pct !== null ? h.html` <span class="muted">(${ordinal(p.att8Pct)} percentile)</span>` : ''}`],
        history.length > 0 && ['Previous years', history.join(', ')],
        p.att8Years > 1 && [`${p.att8Years}-year average`, fmt(p.att8Avg)],
        ...extra('after-average'),
        ['English & maths grade 5+', fmt(p.engMaths5, 0, '%')],
        ...extra('after-engmaths'), // grade 4+ and 5-GCSE rows from ks4-pass-rates
        ['Entering EBacc', fmt(p.ebaccEntry, 0, '%')],
        ...extra('after-ebacc'),
        p.ks4Cohort !== null && ['Pupils in year group', String(p.ks4Cohort)],
        ...extra(), // includes the disadvantaged-pupil rows from ks4-disadvantaged
      ]);
      const caveat =
        p.sector === 'independent'
          ? h.note('Many independent schools take IGCSEs, which don’t count towards Attainment 8, so scores can be misleadingly low.')
          : null;
      return h.html`${table}${caveat}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'ks4',
    order: 10,
    about: (meta, h) => h.html`${h.sourceLink('ks4', 'DfE key stage 4 performance')} (${(meta.ks4Years as string[]).join(', ')})`,
    dates: (meta) => [ks4Year(meta) && `GCSEs ${ks4Year(meta)}`, meta.p8Year ? `Progress 8 ${meta.p8Year as string}` : null],
  },
];
