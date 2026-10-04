import { fmt, quintile, type Metadata, type ModeDef, type Phase, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const year = (meta: Metadata) => (meta.absenceYear as string | null | undefined) ?? null;

const mode = (phase: Phase): ModeDef => ({
  phases: [phase],
  id: 'absence',
  label: 'Absence',
  order: 120,
  // Lower absence is better, so the diverging palette runs blue (lowest absence) to red (highest)
  description: (meta) =>
    `Share of pupils who are persistently absent, meaning they miss 10% or more of school sessions (about one day in ten), for any reason (${year(meta) ?? 'latest year'}). ` +
    'Schools are shown as a percentile among state schools, with the lowest absence at the top. ' +
    `Absence is closely linked to disadvantage, just as raw ${phase === 'secondary' ? 'GCSE' : 'KS2'} results are, so compare schools with similar intakes. ` +
    'State-funded schools only: independent schools publish no figures.',
  buckets: [
    { label: 'Lowest 20% absence', colour: 4 },
    { label: 'Next 20%', colour: 3 },
    { label: 'Middle 20%', colour: 2 },
    { label: 'Next 20%', colour: 1 },
    { label: 'Highest 20% absence', colour: 0 },
  ],
  bucketOf: (p) => quintile(p.absencePersistentPctile),
  // Best (lowest absence) first
  sortValue: (p) => (p.absencePersistentPct === null ? null : -p.absencePersistentPct),
  formatValue: (p) => (p.absencePersistentPct === null ? '–' : fmt(p.absencePersistentPct, 1, '% persistently absent')),
});

export const modes: ModeDef[] = [mode('secondary'), mode('primary')];

const section = (phase: Phase): PopupSectionDef => ({
  phases: [phase],
  id: 'absence',
  group: 'conduct',
  order: 35,
  title: (p) => `Attendance${p.absenceYear ? ` (${p.absenceYear})` : ''}`,
  render(p, h, _extra, meta) {
    if (p.absenceOverallPct === null && p.absencePersistentPct === null && p.absenceSeverePct === null) return null;
    const median = (key: string) => (meta?.[key] as number | null | undefined) ?? null;
    const national = (key: string) => (median(key) === null ? null : fmt(median(key), 1, '%'));
    const pupils = p.absencePupils === null ? null : h.note(`Based on ${p.absencePupils.toLocaleString('en-GB')} pupils on roll during the year.`);
    return h.html`${h.table(
      ['', 'This school', `Typical ${phase}`],
      [
        ['Overall absence', fmt(p.absenceOverallPct, 1, '%'), national('absenceMedianOverallPct')],
        ['Persistent absence (10%+ of sessions missed)', fmt(p.absencePersistentPct, 1, '%'), national('absenceMedianPersistentPct')],
        ['Severe absence (50%+ missed)', fmt(p.absenceSeverePct, 1, '%'), national('absenceMedianSeverePct')],
      ],
    )}${h.note(`Persistent and severe absence are shares of pupils; overall absence is the share of sessions missed. Typical is the median state ${phase}. Lower is better, but absence is closely linked to disadvantage.`)}${pupils}`;
  },
});

export const popupSections: PopupSectionDef[] = [section('secondary'), section('primary')];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'absence',
    order: 90,
    about: (meta, h) => h.html`${h.sourceLink('absence', 'DfE pupil absence in schools in England')}${year(meta) ? h.html` (${year(meta)})` : ''}`,
    dates: (meta) => [year(meta) && `Absence ${year(meta)}`],
  },
];
