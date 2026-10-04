import { QUINTILES, fmt, ordinal, quintile, signed, type ModeDef, type PopupRowDef } from '../../web/toolkit.ts';

export const modes: ModeDef[] = [
  {
    id: 'intake',
    label: 'Results vs intake',
    order: 20,
    description: (meta) =>
      `Attainment 8 (${(meta.ks4Years as string[] | undefined)?.[0] ?? 'latest'}) compared with the score expected for the school's intake, ranked among state schools. ` +
      'The expected score is our own estimate, from the share of disadvantaged pupils, the share with English as an additional language, ' +
      'the share of low and high attainers at the end of primary school (from the latest year published) and whether the school is girls-only or boys-only. ' +
      'It is not an official measure. It cannot see everything about intake, such as special educational needs, so treat small differences as noise. ' +
      'Grammar schools score highly by design because their pupils are selected on ability. ' +
      'It is the most recent measure that allows for intake: Progress 8 is not published for 2024/25.',
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
        ? ['Vs expected for intake', h.html`${signed(p.att8VsIntake, 1)} <span class="muted">(${ordinal(p.att8VsIntakePct)} percentile, our own estimate)</span>`]
        : null,
  },
  {
    id: 'vs-intake-margin',
    section: 'gcse',
    slot: 'after-average',
    order: 11,
    row: (p, h) =>
      p.att8VsIntake !== null && p.att8VsIntakeSe !== null
        ? [
            'Margin of error',
            h.html`± ${fmt(1.96 * p.att8VsIntakeSe, 1)} <span class="muted">(chance only${p.att8IntakeModel === 'full' ? '' : '; school has no prior attainment figures'})</span>`,
          ]
        : null,
  },
];
