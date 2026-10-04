import { fmt, type Metadata, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const year = (meta: Metadata, key: string) => (meta[key] as string | null | undefined) ?? null;

// No map mode: these are not good or bad in themselves (a low ratio can mean a small or costly school), so no colour scale.
export const popupSections: PopupSectionDef[] = [
  {
    id: 'workforce',
    group: 'pupils',
    order: 56,
    title: (p) => `Staff${p.workforceYear ? ` (${p.workforceYear})` : ''}`,
    render(p, h, _extra, meta) {
      const lines: [string, number | null, string, number, string][] = [
        ['Teachers (full-time equivalent)', p.teachersFte, 'workforceMedianTeachersFte', 1, ''],
        ['Pupils per teacher', p.pupilTeacherRatio, 'workforceMedianPupilTeacherRatio', 1, ''],
        ['Teachers without qualified teacher status', p.unqualifiedTeachersPct, 'workforceMedianUnqualifiedPct', 1, '%'],
        ['Teachers working part time', p.partTimeTeachersPct, 'workforceMedianPartTimePct', 0, '%'],
        ['Teacher sickness, days a year', p.teacherSicknessDays, 'workforceMedianSicknessDays', 1, ''],
        ['Teachers with any sickness absence', p.teachersTakingAbsencePct, 'workforceMedianTakingAbsencePct', 0, '%'],
      ];
      // A missing figure hides its row rather than showing a dash
      const shown = lines.filter(([, value]) => value !== null);
      if (shown.length === 0) return null;
      const typical = (key: string, decimals: number, unit: string) => {
        const m = (meta?.[key] as number | null | undefined) ?? null;
        return m === null ? null : fmt(m, decimals, unit);
      };
      const sickness = p.teacherSicknessDays !== null || p.teachersTakingAbsencePct !== null;
      const sicknessYear = sickness && p.sicknessYear && p.sicknessYear !== p.workforceYear ? ` Sickness absence is for ${p.sicknessYear}.` : '';
      return h.html`${h.table(
        ['', 'This school', 'Typical secondary'],
        shown.map(([label, value, key, decimals, unit]) => [label, fmt(value, decimals, unit), typical(key, decimals, unit)]),
      )}${h.note(`Pupils per teacher is our own calculation (pupils on roll divided by full-time-equivalent teachers), so it will not match the DfE's national figure exactly. Some academies employ able teachers who do not hold qualified teacher status. Small schools can have a low ratio simply because every subject needs a teacher. Typical is the median state secondary.${sicknessYear}`)}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'workforce',
    order: 94,
    about: (meta, h) => h.html`${h.sourceLink('workforce', 'DfE School workforce in England')}${year(meta, 'workforceYear') ? h.html` (${year(meta, 'workforceYear')})` : ''}`,
    dates: (meta) => [year(meta, 'workforceYear') && `Teacher numbers ${year(meta, 'workforceYear')}`, year(meta, 'sicknessYear') && `Teacher sickness ${year(meta, 'sicknessYear')}`],
  },
];
