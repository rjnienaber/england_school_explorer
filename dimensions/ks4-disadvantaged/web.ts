import { MIN_DISADVANTAGED_PUPILS } from './constants.ts';
import { QUINTILES, fmt, ordinal, quintile, signed, type ModeDef, type PopupRowDef } from '../../web/toolkit.ts';

export const modes: ModeDef[] = [
  {
    id: 'disadvantaged',
    label: 'Disadvantaged pupils',
    order: 100,
    description: (meta) =>
      `Average GCSE score (Attainment 8, ${((meta.ks4Years as string[] | undefined)?.[0]) ?? 'latest'}) of disadvantaged pupils only: those who had free school meals in the last 6 years, or are looked after. ` +
      'Shown as a percentile among state schools, so it partly allows for a school’s intake. ' +
      `Schools with fewer than ${MIN_DISADVANTAGED_PUPILS} disadvantaged pupils are left out, as their averages swing too much. ` +
      'The gap to other pupils is in the popup but not used for colour: a small gap can simply mean other pupils do badly. ' +
      'State schools only; independent schools are grey. Our own ranking, not an official measure.',
    buckets: QUINTILES,
    bucketOf: (p) => quintile(p.att8DisadvantagedPct),
    sortValue: (p) => p.att8Disadvantaged,
    formatValue: (p) =>
      p.att8Disadvantaged === null ? '–' : p.att8Disadvantaged.toFixed(1) + (p.att8DisadvantagedPct !== null ? ` · ${ordinal(p.att8DisadvantagedPct)}` : ''),
  },
];

// Replaces the two disadvantaged rows ks4-headline used to show in the GCSE results table.
export const popupRows: PopupRowDef[] = [
  {
    id: 'disadvantaged-share',
    section: 'gcse',
    order: 10,
    row: (p) => {
      if (p.disadvantagedPct === null) return null;
      const n = p.disadvantagedCount !== null ? ` (${p.disadvantagedCount} pupils)` : '';
      return ['Disadvantaged pupils', fmt(p.disadvantagedPct, 0, '%') + n];
    },
  },
  {
    id: 'disadvantaged-att8',
    section: 'gcse',
    order: 11,
    row: (p, h) => {
      if (p.att8Disadvantaged === null) return null;
      const others = p.att8NotDisadvantaged !== null ? ` vs ${fmt(p.att8NotDisadvantaged)} for other pupils` : '';
      const gap = p.disadvantageGap !== null ? `, gap ${signed(p.disadvantageGap, 1)}` : '';
      const small =
        p.disadvantagedCount !== null && p.disadvantagedCount < MIN_DISADVANTAGED_PUPILS
          ? h.html`<br><span class="muted">Fewer than ${MIN_DISADVANTAGED_PUPILS} pupils: not ranked or compared</span>`
          : '';
      return ['…their Attainment 8', h.html`${fmt(p.att8Disadvantaged)}${others}${gap}${small}`];
    },
  },
];
