import { fmt, type PopupRowDef } from '../../web/toolkit.ts';

// One row in the GCSE results table, straight after the Attainment 8 lines. With only one subject
// published, only that one is shown.
export const popupRows: PopupRowDef[] = [
  {
    id: 'english-maths-grades',
    section: 'gcse',
    slot: 'after-average',
    order: 50,
    row: (p, h) => {
      const parts = [
        p.englishGrade !== null && h.html`English ${fmt(p.englishGrade)}`,
        p.mathsGrade !== null && h.html`Maths ${fmt(p.mathsGrade)}`,
      ].filter((x) => x !== false);
      return parts.length === 0 ? null : ['Average grade (1-9)', h.html`${parts[0]}${parts[1] ? h.html` · ${parts[1]}` : ''}`];
    },
  },
];
