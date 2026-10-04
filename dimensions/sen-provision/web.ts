import { SEN_NEEDS, needLabels } from './needs.ts';
import type { FilterDef, PopupSectionDef, PopupTagDef, SourceNoteDef } from '../../web/toolkit.ts';

const LOCAL_OFFER = 'The register may be out of date and does not say how many pupils a school can take: check the local authority’s “local offer” and ask the school.';

export const filters: FilterDef[] = [
  {
    id: 'senProvision',
    order: 120,
    control: { kind: 'checkbox', label: 'Has an SEN unit or resourced provision' },
    default: false,
    test: (p, on) => !on || p.senProvision !== null,
  },
  {
    id: 'senNeed',
    order: 121,
    // Greyed out, and ignored, until the checkbox above is ticked
    enabledBy: 'senProvision',
    control: {
      kind: 'select',
      label: 'Type of need',
      options: [{ value: '', label: 'Any' }, ...Object.entries(SEN_NEEDS).map(([value, label]) => ({ value, label }))],
    },
    default: '',
    test: (p, need) => !need || (p.senNeeds ?? '').split(',').includes(need),
  },
];

export const popupTags: PopupTagDef[] = [
  {
    id: 'senProvision',
    order: 60,
    tag: (p) =>
      p.senProvision === null
        ? null
        : { text: p.senProvision === 'resourced' ? 'Resourced provision' : p.senProvision === 'unit' ? 'SEN unit' : 'SEN unit and resourced provision' },
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'sen',
    order: 65,
    title: 'Special educational needs provision',
    render: (p, h) => {
      if (p.senProvision === null) return null;
      const what = p.senProvision === 'resourced' ? 'Resourced provision' : p.senProvision === 'unit' ? 'SEN unit' : 'SEN unit and resourced provision';
      const needs = needLabels(p.senNeeds);
      return h.html`${h.rows([
        ['Has', what],
        ['Needs catered for', needs.length ? needs.join(', ') : 'Not listed in the register'],
        ['Places', p.senPlaces === null ? null : p.senPlaces.toLocaleString('en-GB')],
      ])}${h.note(LOCAL_OFFER)}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'sen',
    order: 25,
    about: (_meta, h) => h.html`${h.sourceLink('gias', 'Get Information About Schools')} (SEN units, resourced provision and the needs they cater for; self-reported by schools, so check the local offer)`,
  },
];
