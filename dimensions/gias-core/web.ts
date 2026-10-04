import type { FilterDef, PopupSectionDef, PopupTagDef, SourceNoteDef } from '../../web/toolkit.ts';

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
  { id: 'trust', order: 50, tag: (p) => (p.trust ? { text: p.trust } : null) },
];

// Links to the school's own pages on the official sites, all keyed by URN. Checked against live
// pages for an academy, a maintained and an independent school. The performance tables redirect
// /school/{urn} to /school/{urn}/{name-slug}, which is fine. The finance tool (FBIT) covers
// state-funded schools only: it answers 404 for independent ones, so that link is left out.
export const popupSections: PopupSectionDef[] = [
  {
    id: 'official-links',
    order: 90,
    title: 'More information',
    render: (p, h) => {
      const links = [
        h.link(`https://www.compare-school-performance.service.gov.uk/school/${p.urn}`, 'Performance tables'),
        h.link(`https://get-information-schools.service.gov.uk/Establishments/Establishment/Details/${p.urn}`, 'School register'),
        p.sector === 'state' ? h.link(`https://financial-benchmarking-and-insights-tool.education.gov.uk/school/${p.urn}`, 'Finances') : null,
      ].filter((l) => l !== null);
      return h.meta(h.html`${links.flatMap((l, i) => (i ? [' · ', l] : [l]))}`);
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'gias',
    order: 20,
    about: (_meta, h) => h.html`${h.sourceLink('gias', 'Get Information About Schools')} register (locations and school details)`,
  },
];
