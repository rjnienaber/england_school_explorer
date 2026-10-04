import { fmt, type ModeDef, type PopupSectionDef } from '../../web/toolkit.ts';

export const modes: ModeDef[] = [
  {
    id: 'full',
    label: 'How full',
    order: 110,
    palette: 'sequential', // fullness is neither good nor bad
    description:
      'Pupils on roll as a share of the school’s recorded capacity. DfE publishes no applications or offers per school, so this is the nearest measure of how popular a school is. ' +
      'Caveats: capacity figures can be old and include the sixth form where there is one; independent schools report their own figures; ' +
      'and a full school is not always oversubscribed, as it may be full of pupils placed there because other schools were full.',
    buckets: [
      { label: 'Over 105% full', colour: 4 },
      { label: '95–105%', colour: 3 },
      { label: '85–95%', colour: 2 },
      { label: '70–85%', colour: 1 },
      { label: 'Under 70%', colour: 0 },
    ],
    bucketOf: (p) => {
      const f = p.fullPct;
      if (f === null) return null;
      return f < 70 ? 0 : f < 85 ? 1 : f < 95 ? 2 : f <= 105 ? 3 : 4;
    },
    sortValue: (p) => p.fullPct,
    formatValue: (p) => fmt(p.fullPct, 0, '% full'),
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'capacity',
    group: 'pupils',
    order: 60,
    title: 'Pupils and capacity',
    render: (p, h) => {
      if (p.pupils === null || p.capacity === null) return null;
      const full = p.fullPct !== null ? ` (${p.fullPct}% full)` : '';
      return h.html`${h.rows([['Pupils on roll', h.html`${p.pupils.toLocaleString('en-GB')} · capacity ${p.capacity.toLocaleString('en-GB')}${full}`]])}${h.note('Capacity figures can be old and include the sixth form. A full school is not always oversubscribed.')}`;
    },
  },
];
