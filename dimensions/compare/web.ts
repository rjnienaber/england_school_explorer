import type { ExtensionDef, FilterDef, PopupSectionDef, SourceNoteDef } from '../../web/toolkit.ts';
import { parseShortlist } from './shortlist.ts';

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

/** The button is wired by the extension (web-ui.ts), which also keeps its label up to date. Independent schools have no comparison data. */
export const popupSections: PopupSectionDef[] = [
  {
    id: 'compare',
    order: 6,
    render: (p, h) =>
      p.sector === 'independent'
        ? h.note('Independent schools publish no GCSE or Progress 8 figures here, so they can’t be added to a shortlist comparison.')
        : h.html`<p class="trust-link"><button type="button" class="link-button" data-compare-toggle="${p.urn}">Add to shortlist</button></p>`,
  },
];

export const extensions: ExtensionDef[] = [{ id: 'compare', start: (app) => import('./web-ui.ts').then((m) => m.start(app)) }];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'compare',
    order: 95,
    about: (_meta, h) =>
      h.html`<strong>Shortlist comparison.</strong> “Likely better” means a 90% or higher chance that the difference is real, worked out from each figure’s standard error (a 95% confidence interval divided by 3.92 for Progress 8; the binomial spread for percentages; the spread of pupils’ scores divided by the square root of the year group for Attainment 8). These allow for chance only. They do not allow for anything the measure cannot see, so they make the differences look firmer than they are. England averages in the table are our own pupil-weighted averages of the schools on this map.`,
  },
];
