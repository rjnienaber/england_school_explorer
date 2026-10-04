import { fmt, type FilterDef, type PopupSectionDef } from '../../web/toolkit.ts';

/** "Most pupils" means at least half the year group. */
const TRIPLE_SCIENCE_MAJORITY = 50;

export const filters: FilterDef[] = [
  {
    id: 'tripleScience',
    order: 100,
    control: { kind: 'checkbox', label: 'Most pupils take triple science' },
    default: false,
    // Schools with no figure are hidden while this is on: we can't say most of them do
    test: (p, on) => !on || (p.tripleSciencePct !== null && p.tripleSciencePct >= TRIPLE_SCIENCE_MAJORITY),
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'curriculum',
    order: 25,
    title: (p) => `Curriculum ${p.curriculumYear ?? ''}`,
    render(p, h) {
      if (p.curriculumYear === null) return null;
      const table = h.rows([
        p.tripleSciencePct !== null && ['Taking triple science', fmt(p.tripleSciencePct, 0, '%')],
        p.languagePct !== null && ['Taking a language', fmt(p.languagePct, 0, '%')],
        p.multiLanguagePct !== null && ['Taking more than one language', fmt(p.multiLanguagePct, 0, '%')],
        p.humanitiesPct !== null && ['Taking history or geography', fmt(p.humanitiesPct, 0, '%')],
        p.gcsesPerPupil !== null && ['GCSEs per pupil', fmt(p.gcsesPerPupil, 1)],
      ]);
      return h.html`${table}${h.note('Shares are of the whole year group, entered for the subject (not necessarily passed).')}`;
    },
  },
];
