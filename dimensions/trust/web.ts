import { median, type FilterDef, type PopupSectionDef, type RowEntry, type School } from '../../web/toolkit.ts';

const OFSTED_LEVELS = [
  ['top', 'Outstanding'],
  ['good', 'Good'],
  ['concern', 'Needs improving'],
  ['serious', 'Serious concern'],
] as const;

/** The trust view: only this trust's schools on the map, with a summary in the panel. */
export const filters: FilterDef[] = [
  {
    id: 'trust',
    order: 900,
    control: {
      kind: 'chip',
      label: 'Trust',
      chipText: (schools) => schools[0]?.trust ?? '',
      summary: (schools, _value, h) => {
        const att8 = median(schools.map((s) => s.att8Pct));
        const att8Count = schools.filter((s) => s.att8Pct !== null).length;
        const p8 = median(schools.map((s) => s.p8));
        const p8Count = schools.filter((s) => s.p8 !== null).length;
        const ofsted = (level: string) => schools.filter((s) => s.ofstedSummary === level).length;
        const of = (count: number) => (count < schools.length ? ` (${count} of ${schools.length} schools)` : '');
        const entries: RowEntry[] = [
          ['Schools on this map', schools.length],
          ['Median Attainment 8 rank', att8 === null ? null : h.html`${h.ordinal(Math.round(att8))} percentile${of(att8Count)}`],
          ['Median Progress 8', p8 === null ? null : h.html`${h.signed(p8, 2)}${of(p8Count)}`],
          ...OFSTED_LEVELS.map(([level, label]): RowEntry | null => (ofsted(level) ? [`Ofsted: ${label}`, ofsted(level)] : null)).filter((r) => r !== null),
          ['Ofsted: no recent inspection', schools.filter((s) => s.ofstedSummary === null).length || null],
        ];
        return h.html`${h.rows(entries.filter(([, v]) => v !== null))}${h.note(
          'These are medians of each school’s own latest results and inspection, and our own summary rather than an official trust measure. ' +
            'A school may have joined the trust after its latest results or inspection, so they can reflect its time before the trust. ' +
            'Trusts also run schools that are not on this map (primaries, special schools).',
        )}`;
      },
    },
    default: '',
    test: (p, value) => !value || p.trustId === value,
  },
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
