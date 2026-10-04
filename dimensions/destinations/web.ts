import { fmt, type Metadata, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const year = (meta: Metadata) => (meta.destYear as string | null | undefined) ?? null;

// No map mode: where pupils go reflects the local post-16 choices and the intake as much as the school.
export const popupSections: PopupSectionDef[] = [
  {
    id: 'destinations',
    order: 38,
    title: (p) => `After GCSEs${p.destYear ? ` (${p.destYear} leavers)` : ''}`,
    render(p, h, _extra, meta) {
      const lines: [string, number | null, string][] = [
        ['School sixth form', p.destSchoolSixth, 'destMedianSchoolSixth'],
        ['Sixth form college', p.destSixthCollege, 'destMedianSixthCollege'],
        ['Further education college', p.destFe, 'destMedianFe'],
        ['Apprenticeship', p.destApprenticeship, 'destMedianApprenticeship'],
        ['Employment', p.destWork, 'destMedianWork'],
        ['No lasting destination', p.destNotSustained, 'destMedianNotSustained'],
      ];
      // A suppressed or missing figure hides its row rather than showing a dash
      const shown = lines.filter(([, value]) => value !== null);
      if (p.destSustained === null && shown.length === 0) return null;
      const typical = (key: string) => {
        const m = (meta?.[key] as number | null | undefined) ?? null;
        return m === null ? null : fmt(m, 0, '%');
      };
      const headline =
        p.destSustained === null ? null : h.html`<p><strong>${fmt(p.destSustained, 0, '%')}</strong> stayed in education, training or work</p>`;
      const table = shown.length === 0 ? null : h.table(['', 'This school', 'Typical secondary'], shown.map(([label, value, key]) => [label, fmt(value, 0, '%'), typical(key)]));
      const cohort = p.destCohort === null ? null : h.note(`Based on ${p.destCohort.toLocaleString('en-GB')} pupils who finished Year 11. In a small school one pupil moves each figure by a point or more.`);
      return h.html`${headline}${table}${h.note('Measured the autumn and spring after Year 11, so figures are about two years old. The rest of the pupils had a destination that is unknown. Typical is the median state secondary. Where pupils go depends on the post-16 courses nearby as much as on the school.')}${cohort}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'destinations',
    order: 92,
    about: (meta, h) => h.html`${h.sourceLink('destinations', 'DfE key stage 4 destination measures')}${year(meta) ? h.html` (${year(meta)} leavers)` : ''}`,
    dates: (meta) => [year(meta) && `Destinations after Year 11: ${year(meta)} leavers`],
  },
];
