import { QUINTILES, ordinal, quintile, signed, type ModeDef, type PopupRowDef } from '../../web/toolkit.ts';

export const modes: ModeDef[] = [
  {
    id: 'intake',
    label: 'Results vs intake',
    order: 20,
    description: (meta) =>
      `Attainment 8 (${(meta.ks4Years as string[] | undefined)?.[0] ?? 'latest'}) compared with the score expected for a school with the same share of ` +
      'disadvantaged pupils, ranked among state schools. This is our own estimate, not an official measure. ' +
      'Grammar schools score highly by design because their intake is selected on ability.',
    buckets: QUINTILES,
    bucketOf: (p) => quintile(p.att8VsIntakePct),
    sortValue: (p) => p.att8VsIntake,
    formatValue: (p) => (p.att8VsIntake === null ? '–' : signed(p.att8VsIntake, 1)),
  },
];

// A row in the GCSE results table (owned by ks4-headline), right after the averages
export const popupRows: PopupRowDef[] = [
  {
    id: 'vs-intake',
    section: 'gcse',
    slot: 'after-average',
    order: 10,
    row: (p, h) =>
      p.att8VsIntake !== null && p.att8VsIntakePct !== null
        ? ['Vs expected for intake', h.html`${signed(p.att8VsIntake, 1)} <span class="muted">(${ordinal(p.att8VsIntakePct)} percentile)</span>`]
        : null,
  },
];
