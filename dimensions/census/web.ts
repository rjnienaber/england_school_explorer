import { fmt, type Metadata, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const year = (meta: Metadata) => (meta.censusYear as string | null | undefined) ?? null;

// "2025/26" is the census taken in January 2026
const januaryOf = (academicYear: string) => `January 20${academicYear.slice(5)}`;

// No map mode: these describe who attends, not how well the school does, so there is no good or bad end to colour.
export const popupSections: PopupSectionDef[] = [
  {
    id: 'census',
    order: 55,
    title: (p) => `Pupils${p.censusYear ? ` (${januaryOf(p.censusYear)} census)` : ''}`,
    render(p, h, _extra, meta) {
      if (p.censusPupils === null && p.fsmPct === null && p.ealPctAll === null) return null;
      const typical = (key: string) => {
        const m = (meta?.[key] as number | null | undefined) ?? null;
        return m === null ? null : fmt(m, key === 'censusMedianPupils' ? 0 : 1, key === 'censusMedianPupils' ? '' : '%');
      };
      const shares: [string, number | null, string][] = [
        ['Free school meals', p.fsmPct, 'censusMedianFsmPct'],
        ['English as an additional language', p.ealPctAll, 'censusMedianEalPct'],
      ];
      // A suppressed or missing figure hides its row rather than showing a dash
      const lines: [string, string, string | null][] = [];
      if (p.censusPupils !== null) lines.push(['Pupils on roll', p.censusPupils.toLocaleString('en-GB'), typical('censusMedianPupils')]);
      for (const [label, value, key] of shares) if (value !== null) lines.push([label, fmt(value, 1, '%'), typical(key)]);
      return h.html`${h.table(['', 'This school', 'Typical secondary'], lines)}${h.note('Whole school, all year groups. Free school meals means eligible on census day, whether or not the pupil takes the meal. These describe the pupils, not how good the school is; a school with many pupils from low-income families can do very well. There is no school-level SEN figure in the open DfE data. Typical is the median state secondary.')}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'census',
    order: 93,
    about: (meta, h) => h.html`${h.sourceLink('census', 'DfE Schools, pupils and their characteristics')}${year(meta) ? h.html` (${januaryOf(year(meta)!)} census)` : ''}`,
    dates: (meta) => [year(meta) && `Pupil numbers ${januaryOf(year(meta)!)} census`],
  },
];
