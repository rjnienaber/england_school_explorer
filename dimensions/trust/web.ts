import { median, type ChipFilter, type FilterDef, type Phase, type PopupSectionDef, type RowEntry, type School } from '../../web/toolkit.ts';

const OFSTED_LEVELS = [
  ['top', 'Outstanding'],
  ['good', 'Good'],
  ['concern', 'Needs improving'],
  ['serious', 'Serious concern'],
] as const;

const NOTE_ALIKE =
  'These are medians of each school’s own latest results and inspection, and our own summary rather than an official trust measure. ' +
  'A school may have joined the trust after its latest results or inspection, so they can reflect its time before the trust. ';

/** Primary: one median (the KS2 result) and counts of inspections, so the wording says which is which. */
const NOTE_ALIKE_PRIMARY =
  'The KS2 figure is the median of each school’s own latest result, and the Ofsted rows count each school’s latest inspection. ' +
  'Both are our own summary rather than an official trust measure. ' +
  'Primary year groups are small, so one school’s result can swing a lot from year to year. ' +
  'A school may have joined the trust after its latest results or inspection, so they can reflect its time before the trust. ';

/** " (12 of 14 schools)" when only some of the trust's schools have the figure. */
const ofCount = (count: number, total: number) => (count < total ? ` (${count} of ${total} schools)` : '');

/** Rows for the Ofsted outcomes of the trust's schools, which both phases have. */
const ofstedRows = (schools: School[]): RowEntry[] => {
  const count = (level: string) => schools.filter((s) => s.ofstedSummary === level).length;
  return [
    ...OFSTED_LEVELS.map(([level, label]): RowEntry | null => (count(level) ? [`Ofsted: ${label}`, count(level)] : null)).filter((r) => r !== null),
    ['Ofsted: no recent inspection', schools.filter((s) => s.ofstedSummary === null).length || null],
  ];
};

/** The trust view: only this trust's schools on the map, with a summary in the panel. */
const trustFilter = (phases: readonly Phase[], summary: NonNullable<ChipFilter['control']['summary']>): FilterDef => ({
  id: 'trust',
  phases,
  order: 900,
  control: { kind: 'chip', label: 'Trust', chipText: (schools) => schools[0]?.trust ?? '', summary },
  default: '',
  test: (p, value) => !value || p.trustId === value,
});

export const filters: FilterDef[] = [
  trustFilter(['secondary'], (schools, _value, h) => {
    const att8 = median(schools.map((s) => s.att8Pct));
    const att8Count = schools.filter((s) => s.att8Pct !== null).length;
    const p8 = median(schools.map((s) => s.p8));
    const p8Count = schools.filter((s) => s.p8 !== null).length;
    const of = (count: number) => ofCount(count, schools.length);
    const entries: RowEntry[] = [
      ['Schools on this map', schools.length],
      ['Median Attainment 8 rank', att8 === null ? null : h.html`${h.ordinal(Math.round(att8))} percentile${of(att8Count)}`],
      ['Median Progress 8', p8 === null ? null : h.html`${h.signed(p8, 2)}${of(p8Count)}`],
      ...ofstedRows(schools),
    ];
    return h.html`${h.rows(entries.filter(([, v]) => v !== null))}${h.note(`${NOTE_ALIKE}Trusts also run schools that are not on this map (primaries, special schools).`)}`;
  }),
  // Primary schools: the share reaching the expected standard in KS2, and their inspections
  trustFilter(['primary'], (schools, _value, h) => {
    const expected = median(schools.map((s) => s.ks2RwmExpected));
    const expectedCount = schools.filter((s) => s.ks2RwmExpected !== null).length;
    const entries: RowEntry[] = [
      ['Schools on this map', schools.length],
      ['Median reaching the expected standard in KS2', expected === null ? null : h.html`${Math.round(expected)}%${ofCount(expectedCount, schools.length)}`],
      ...ofstedRows(schools),
    ];
    return h.html`${h.rows(entries.filter(([, v]) => v !== null))}${h.note(`${NOTE_ALIKE_PRIMARY}Trusts also run schools that are not on this map (secondaries, special schools).`)}`;
  }),
];

// Right under the school's tags, which already name the trust
export const popupSections: PopupSectionDef[] = [
  {
    id: 'trust',
    order: 5,
    render: (p: School, h) =>
      p.trustId && p.trustSchools !== null && p.trustSchools > 1
        ? h.html`<p class="trust-link">${h.filterButton('trust', p.trustId, `See all ${p.trustSchools} schools in this trust`)}</p>`
        : null,
  },
];
