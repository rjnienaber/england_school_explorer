import { fmt, type PopupRowDef } from '../../web/toolkit.ts';

// Rows for the GCSE results table, slotted next to the grade 5+ English and maths and EBacc
// entry rows so each 4+/5+ pair reads together. Schools with suppressed figures show nothing.
export const popupRows: PopupRowDef[] = [
  {
    id: 'eng-maths-4',
    section: 'gcse',
    slot: 'after-engmaths',
    order: 10,
    row: (p) => (p.engMaths4 === null ? null : ['English & maths grade 4+', fmt(p.engMaths4, 0, '%')]),
  },
  {
    id: 'five-gcse-eng-maths',
    section: 'gcse',
    slot: 'after-engmaths',
    order: 20,
    row: (p) => (p.fiveGcseEngMaths === null ? null : ['5+ GCSEs at grade 4+ incl. English & maths', fmt(p.fiveGcseEngMaths, 0, '%')]),
  },
  {
    id: 'ebacc-achieved',
    section: 'gcse',
    slot: 'after-ebacc',
    order: 10,
    row: (p, h) =>
      p.ebacc4 === null || p.ebacc5 === null
        ? null
        : ['Achieving EBacc, grade 4+ / 5+', h.html`${fmt(p.ebacc4, 0, '%')} / ${fmt(p.ebacc5, 0, '%')}`],
  },
];
