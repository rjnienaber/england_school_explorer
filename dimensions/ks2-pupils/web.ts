import { fmt, type Metadata, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const year = (meta: Metadata | undefined) => (meta?.ks2PupilsYear as string | null | undefined) ?? null;

// No map mode: these describe who the pupils are, not how well the school does, so there is no good or bad end to colour.
export const popupSections: PopupSectionDef[] = [
  {
    id: 'ks2-pupils',
    group: 'pupils',
    order: 54,
    title: (p) => `Year 6 pupils${p.ks2PupilsYear ? ` (${p.ks2PupilsYear})` : ''}`,
    render(p, h, _extra, meta) {
      const typical = (key: string) => {
        const m = (meta?.[key] as number | null | undefined) ?? null;
        return m === null ? null : fmt(m, 0, '%');
      };
      const lines: [string, number | null, string][] = [
        ['Disadvantaged', p.ks2DisadvantagedPct, 'ks2PupilsMedianDisadvantagedPct'],
        ['SEN support', p.ks2SenSupportPct, 'ks2PupilsMedianSenSupportPct'],
        ['Education, health and care plan', p.ks2EhcpPct, 'ks2PupilsMedianEhcpPct'],
        ['English as an additional language', p.ks2EalPct, 'ks2PupilsMedianEalPct'],
      ];
      // A suppressed or missing figure hides its row rather than showing a dash
      const shown = lines.filter(([, value]) => value !== null);
      if (shown.length === 0) return null;
      return h.html`${h.table(
        ['', 'This school', 'Typical primary'],
        shown.map(([label, value, key]) => [label, fmt(value, 0, '%'), typical(key)]),
      )}${h.note(
        'Share of the pupils who took the KS2 tests (Year 6), not the whole school. Disadvantaged means eligible for free school meals at any time in the last six years, or looked after or adopted from care. SEN is special educational needs. These describe the pupils, not how good the school is; a school with many disadvantaged pupils can do very well. Typical is the median state primary.',
      )}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'ks2-pupils',
    order: 11,
    about: (meta, h) => h.html`${h.sourceLink('ks2-info', 'DfE key stage 2 school information')}${year(meta) ? h.html` (${year(meta)}; the Year 6 pupils who took the tests)` : ''}`,
  },
];
