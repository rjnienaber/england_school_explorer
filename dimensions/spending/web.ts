import { fmt, type Metadata, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const text = (meta: Metadata | undefined, key: string) => (meta?.[key] as string | null | undefined) ?? null;
const pounds = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

// No map mode: spending is not good or bad in itself (small, sixth-form and special schools cost more per pupil), so no colour scale.
export const popupSections: PopupSectionDef[] = [
  {
    id: 'spending',
    order: 58,
    title: (p) => `Funding${p.spendYear ? ` (${p.spendYear})` : ''}`,
    render(p, h, _extra, meta) {
      if (p.spendPerPupil === null && p.teachingStaffSpendPct === null) return null;
      const academy = p.spendBasis === 'academy';
      const suffix = academy ? 'Academy' : 'Maintained';
      const median = (key: string) => (meta?.[`spendMedian${key}${suffix}`] as number | null | undefined) ?? null;
      const perPupil = median('PerPupil');
      const teaching = median('TeachingPct');
      const lines: [string, string, string | null][] = [];
      if (p.spendPerPupil !== null) lines.push(['Spending per pupil', pounds(p.spendPerPupil), perPupil === null ? null : pounds(perPupil)]);
      if (p.teachingStaffSpendPct !== null) lines.push(['Spent on teaching staff', fmt(p.teachingStaffSpendPct, 1, '%'), teaching === null ? null : fmt(teaching, 1, '%')]);
      const caveat = academy
        ? 'Academies report through their trust. This is the academy’s own spending and leaves out the share of the trust’s central costs that the DfE tool adds, so it reads lower than the figure there; compare with other academies.'
        : 'Maintained schools report their own spending, for the financial year April to March.';
      // The academy and maintained returns come out in different months and can be for different years
      const other = text(meta, academy ? 'spendMaintainedYear' : 'spendAcademyYear');
      const years = other && other !== p.spendYear ? ` Academies and maintained schools are reported for different years (${text(meta, 'spendAcademyYear')} and ${text(meta, 'spendMaintainedYear')}).` : '';
      return h.html`${h.table(['', 'This school', academy ? 'Typical academy' : 'Typical maintained school'], lines)}${h.note(
        `${caveat} Total spending including premises and staff, not capital. Small schools, sixth forms and special needs provision raise the cost per pupil, so a higher figure is not wrong in itself. Typical is the median state secondary of the same kind.${years}`,
      )}${h.meta(h.link(`https://financial-benchmarking-and-insights-tool.education.gov.uk/school/${p.urn}`, 'Full breakdown and similar schools on the DfE finance tool'))}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'spending',
    order: 96,
    about: (_meta, h) => h.html`${h.sourceLink('spending', 'DfE Financial Benchmarking and Insights Tool (school finance returns)')}`,
    dates: (meta) => {
      const m = text(meta, 'spendMaintainedYear');
      const a = text(meta, 'spendAcademyYear');
      return [m && `Maintained school spending ${m}`, a && `Academy spending ${a}`];
    },
  },
];
