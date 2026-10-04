import { fmt, type Metadata, type Phase, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const year = (meta: Metadata | undefined) => (meta?.senYear as string | null | undefined) ?? null;

// "2025/26" is the census taken in January 2026
const januaryOf = (academicYear: string) => `January 20${academicYear.slice(5)}`;

// No map mode: these describe the pupils, not how well the school does, so there is no good or bad end to colour.
const section = (phase: Phase): PopupSectionDef => ({
  id: 'sen-pupils',
  phases: [phase],
  group: 'pupils',
  order: 56,
  title: (p) => `Special educational needs${p.senYear ? ` (${januaryOf(p.senYear)} census)` : ''}`,
  render(p, h, _extra, meta) {
    const typical = (key: string) => {
      const m = (meta?.[key] as number | null | undefined) ?? null;
      return m === null ? null : fmt(m, 1, '%');
    };
    const lines: [string, number | null, string][] = [
      ['SEN support', p.senSupportPct, 'senMedianSupportPct'],
      ['Education, health and care plan', p.senEhcpPct, 'senMedianEhcpPct'],
    ];
    const shown = lines.filter(([, value]) => value !== null);
    if (shown.length === 0) return null;
    return h.html`${h.table(
      ['', 'This school', `Typical ${phase}`],
      shown.map(([label, value, key]) => [label, fmt(value, 1, '%'), typical(key)]),
    )}${h.note(
      `Share of all pupils in the school, every year group. SEN support is extra help for pupils with special educational needs without an education, health and care (EHC) plan; an EHC plan is a legal document for the most complex needs. Schools differ in how readily they identify needs, and a school with a specialist unit or resourced provision (see above) or a special school will be high. These describe the pupils, not how good the school is. ${phase === 'primary' ? 'The Year 6 figures are for the pupils who took the KS2 tests only. ' : ''}Typical is the median state ${phase}.`,
    )}`;
  },
});

export const popupSections: PopupSectionDef[] = [section('secondary'), section('primary')];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'sen-pupils',
    order: 94,
    about: (meta, h) => h.html`${h.sourceLink('sen-school', 'DfE Special educational needs in England')}${year(meta) ? h.html` (${januaryOf(year(meta)!)} census)` : ''}`,
    dates: (meta) => [year(meta) && `SEN figures ${januaryOf(year(meta)!)} census`],
  },
];
