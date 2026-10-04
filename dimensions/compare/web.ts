import type { ExtensionDef, FilterDef, PopupSectionDef, SourceNoteDef } from '../../web/toolkit.ts';
import type { Phase } from '../../lib/phase.ts';
import { parseShortlist } from './shortlist.ts';

// The comparison covers both phases (the module itself builds secondary data; compare-primary builds primary's)
const BOTH: readonly Phase[] = ['secondary', 'primary'];

/** URN sets from a `?compare=` value, kept for the filter's `test` (called once per school on every redraw). */
const parsed = new Map<string, Set<number>>();
const urnsIn = (value: string) => {
  let set = parsed.get(value);
  if (!set) {
    if (parsed.size > 20) parsed.clear();
    set = new Set(parseShortlist(value));
    parsed.set(value, set);
  }
  return set;
};

/** "Show on map" for the shortlist: the map keeps only the shortlisted schools. */
export const filters: FilterDef[] = [
  {
    id: 'compare',
    phases: BOTH,
    order: 920,
    control: {
      kind: 'chip',
      label: 'Shortlist',
      chipText: (_schools, value) => {
        const n = parseShortlist(value).length;
        return `${n} school${n === 1 ? '' : 's'}`;
      },
    },
    default: '',
    test: (p, value) => !value || urnsIn(value).has(p.urn),
  },
];

/** The button is wired by the extension (web-ui.ts), which also keeps its label up to date. Independent schools (secondary only) have no comparison data. */
export const popupSections: PopupSectionDef[] = [
  {
    id: 'compare',
    phases: BOTH,
    order: 6,
    render: (p, h) =>
      p.sector === 'independent'
        ? h.note('Independent schools publish no GCSE or Progress 8 figures here, so they can’t be added to a shortlist comparison.')
        : h.html`<p class="trust-link"><button type="button" class="link-button" data-compare-toggle="${p.urn}">Add to shortlist</button></p>`,
  },
];

export const extensions: ExtensionDef[] = [{ id: 'compare', phases: BOTH, start: (app) => import('./web-ui.ts').then((m) => m.start(app)) }];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'compare',
    order: 95,
    about: (_meta, h) =>
      h.html`<strong>Shortlist comparison.</strong> “Likely better” means a 90% or higher chance that the difference is real, worked out from each figure’s standard error (a 95% confidence interval divided by 3.92 for Progress 8; the binomial spread for percentages; the spread of pupils’ scores divided by the square root of the year group for Attainment 8). These allow for chance only. They do not allow for anything the measure cannot see, so they make the differences look firmer than they are. England averages in the table are our own pupil-weighted averages of the schools on this map.`,
  },
  {
    id: 'compare',
    phases: ['primary'],
    order: 95,
    about: (_meta, h) =>
      h.html`<strong>Shortlist comparison.</strong> “Likely better” means a 90% or higher chance that the difference is real, worked out from each figure’s standard error: the binomial spread of a percentage of the Year 6 group (so a small year group gives a wide range), and a 95% confidence interval divided by 3.92 for KS2 progress, which DfE last published for 2022/23. A school with no published year group size shows its figure with no range and is left out of verdicts. These allow for chance only. They do not allow for anything the measure cannot see, so they make the differences look firmer than they are. KS2 results mostly reflect who joins a school. England averages in the table are our own averages of the state-funded primary schools on this map, weighted by Year 6 pupils (progress scores are a plain average of schools).`,
  },
];
