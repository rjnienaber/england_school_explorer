import { fmt, type PopupRowDef } from '../../web/toolkit.ts';

// Adds one row to the GCSE results table. Single-sex schools have no values, so no row.
export const popupRows: PopupRowDef[] = [
  {
    id: 'boys-girls-att8',
    section: 'gcse',
    order: 20,
    row: (p, h) => {
      if (p.att8Boys === null || p.att8Girls === null) return null;
      const counts = p.boysCount !== null && p.girlsCount !== null ? h.html`<br><span class="muted">${p.boysCount} boys, ${p.girlsCount} girls</span>` : '';
      return ['Boys / girls Attainment 8', h.html`${fmt(p.att8Boys)} / ${fmt(p.att8Girls)}${counts}`];
    },
  },
];
