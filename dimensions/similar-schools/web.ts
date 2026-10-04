import { median, type FilterDef, type PopupSectionDef, type RowEntry, type School } from '../../web/toolkit.ts';
import { MEASURE_LABELS, SIMILAR_COUNT } from './model.ts';
import { parseSimilar, rankAmong, resolveSimilar, similarFocusValue, similarUrlValue } from './shared.ts';

const METHOD =
  'This is our own grouping, not an official one. A school’s similar schools are the ' +
  `${SIMILAR_COUNT} state-funded schools of the same kind (selective or not; boys, girls or mixed) that are closest to it on ` +
  `${MEASURE_LABELS.join(', ')} and whether the area is urban or rural, using the latest figures available. ` +
  'Independent schools and schools missing any of those figures are left out. ' +
  'Similar intake does not mean similar quality: it makes the comparison fairer, not complete, and can miss things such as special educational needs. ' +
  'DfE’s financial benchmarking service picks its own comparison schools for spending, using different rules.';

const METHOD_SHORT =
  `Our own grouping, not an official one: the ${SIMILAR_COUNT} state schools of the same kind (selective or not; boys, girls or mixed) with the most similar intake ` +
  '(disadvantaged pupils, English as an additional language, prior attainment, size, urban or rural). Similar intake does not mean similar quality. Open the view for details.';

/** The value is the school's URN followed by its similar schools' (see shared.ts); the filter keeps exactly those. */
const parsed = new Map<string, Set<number>>();
const urnsIn = (value: string) => {
  let set = parsed.get(value);
  if (!set) {
    if (parsed.size > 20) parsed.clear();
    set = new Set(parseSimilar(value));
    parsed.set(value, set);
  }
  return set;
};

/** Similar-schools view: only the school and its similar schools on the map, with a summary in the panel. */
export const filters: FilterDef[] = [
  {
    id: 'similar',
    order: 910,
    control: {
      kind: 'chip',
      label: 'Similar to',
      chipText: (schools, value) => schools.find((s) => s.urn === Number(value.split('-')[0]))?.name ?? '',
      summary: (schools, value, h) => {
        // Falls back to the first school so the build, which traces this with one school and a made-up value, sees every field it reads
        const focus = schools.find((s) => s.urn === Number(value.split('-')[0])) ?? schools[0];
        if (!focus) return null;
        const others = schools.filter((s) => s !== focus);
        const place = (own: number | null, theirs: (number | null)[], higherIsBetter: boolean) => {
          if (own === null) return null;
          const r = rankAmong(own, theirs, higherIsBetter);
          return h.html`${h.ordinal(r.rank)} of ${r.of}`;
        };
        const att8 = median(others.map((s) => s.att8));
        const absence = median(others.map((s) => s.absencePersistentPct));
        const entries: RowEntry[] = [
          ['Similar schools on this map', others.length],
          ['Attainment 8: this school', focus.att8 === null ? null : h.fmt(focus.att8, 1)],
          ['Attainment 8: median of the others', att8 === null ? null : h.fmt(att8, 1)],
          ['Attainment 8: place', place(focus.att8, others.map((s) => s.att8), true)],
          ['Persistent absence: this school', focus.absencePersistentPct === null ? null : h.fmt(focus.absencePersistentPct, 1, '%')],
          ['Persistent absence: median of the others', absence === null ? null : h.fmt(absence, 1, '%')],
          ['Persistent absence: place (lowest first)', place(focus.absencePersistentPct, others.map((s) => s.absencePersistentPct), false)],
        ];
        return h.html`${h.rows(entries.filter(([, v]) => v !== null))}${h.note(METHOD)}`;
      },
    },
    resolve: resolveSimilar,
    urlValue: similarUrlValue,
    default: '',
    test: (p, value) => !value || urnsIn(value).has(p.urn),
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'similar',
    group: 'similar',
    order: 60,
    title: 'Similar schools',
    render: (p: School, h) => {
      const count = parseSimilar(p.similarUrns).length;
      if (count === 0) return null;
      const att8 = p.similarAtt8Rank !== null && p.similarAtt8Of !== null ? [`Attainment 8`, h.html`${h.ordinal(p.similarAtt8Rank)} of ${p.similarAtt8Of}`] as const : null;
      const absence =
        p.similarAbsenceRank !== null && p.similarAbsenceOf !== null
          ? [`Persistent absence (lowest first)`, h.html`${h.ordinal(p.similarAbsenceRank)} of ${p.similarAbsenceOf}`] as const
          : null;
      return h.html`${h.rows([att8, absence])}<p class="trust-link">${h.filterButton('similar', similarFocusValue(p.urn, p.similarUrns), `See the ${count} similar schools on the map`)}</p>${h.note(METHOD_SHORT)}`;
    },
  },
];
