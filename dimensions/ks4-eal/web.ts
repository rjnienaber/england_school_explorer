import { fmt, type PopupRowDef } from '../../web/toolkit.ts';

// Adds one row to the GCSE results table. Schools with fewer than 10 such pupils have no values.
export const popupRows: PopupRowDef[] = [
  {
    id: 'eal-att8',
    section: 'gcse',
    order: 30,
    row: (p, h) => {
      if (p.ealPct === null && p.att8Eal === null) return null;
      const share = p.ealPct !== null ? `${fmt(p.ealPct, 0, '%')} of the year` : null;
      const score = p.att8Eal !== null ? `Att8 ${fmt(p.att8Eal)}` : null;
      return ['English as an additional language', [share, score].filter((v) => v !== null).join(', ')];
    },
  },
];
