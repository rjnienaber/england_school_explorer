import type { FilterDef, PopupTagDef, SourceNoteDef } from '../../web/toolkit.ts';

export const filters: FilterDef[] = [
  {
    id: 'state',
    order: 10,
    control: { kind: 'checkbox', label: 'State-funded' },
    default: true,
    test: (p, on) => on || p.sector !== 'state',
  },
  {
    id: 'independent',
    order: 20,
    control: { kind: 'checkbox', label: 'Independent' },
    default: false,
    test: (p, on) => on || p.sector !== 'independent',
  },
  {
    id: 'selective',
    order: 30,
    control: { kind: 'checkbox', label: 'Selective (grammar)' },
    default: true,
    test: (p, on) => on || !p.selective,
  },
  {
    id: 'sixthForm',
    order: 40,
    control: { kind: 'checkbox', label: 'Sixth form only' },
    default: false,
    test: (p, on) => !on || p.sixthForm,
  },
  {
    id: 'gender',
    order: 50,
    control: {
      kind: 'select',
      label: 'Pupils',
      options: [
        { value: '', label: 'Any' },
        { value: 'Mixed', label: 'Mixed' },
        { value: 'Girls', label: 'Girls only' },
        { value: 'Boys', label: 'Boys only' },
      ],
    },
    default: '',
    test: (p, value) => !value || p.gender === value,
  },
];

export const popupTags: PopupTagDef[] = [
  { id: 'independent', order: 10, tag: (p) => (p.sector === 'independent' ? { text: 'Independent', warn: true } : null) },
  { id: 'selective', order: 20, tag: (p) => (p.selective ? { text: 'Selective (grammar)', warn: true } : null) },
  { id: 'sixthForm', order: 30, tag: (p) => (p.sixthForm ? { text: 'Sixth form' } : null) },
  { id: 'religion', order: 40, tag: (p) => (p.religion ? { text: p.religion } : null) },
  { id: 'trust', order: 50, tag: (p) => (p.trust ? { text: p.trust } : null) },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'gias',
    order: 20,
    about: (_meta, h) => h.html`${h.sourceLink('gias', 'Get Information About Schools')} register (locations and school details)`,
  },
];
