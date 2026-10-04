import { fmt, type Metadata, type Phase, type PopupSectionDef, type SourceNoteDef } from '../../web/toolkit.ts';

const year = (meta: Metadata) => (meta.exclusionsYear as string | null | undefined) ?? null;

// No map mode: rates for a single school are noisy, so this is a popup section only.
const section = (phase: Phase): PopupSectionDef => ({
  phases: [phase],
  id: 'exclusions',
  group: 'conduct',
  order: 36,
  title: (p) => `Behaviour${p.exclusionsYear ? ` (${p.exclusionsYear})` : ''}`,
  render(p, h, _extra, meta) {
    if (p.suspensionRate === null && p.suspendedPupilsPct === null && p.permanentExclusions === null) return null;
    const median = (key: string) => (meta?.[key] as number | null | undefined) ?? null;
    const typical = (key: string, decimals: number, unit = '') => (median(key) === null ? null : fmt(median(key), decimals, unit));
    const pupils =
      p.exclusionsPupils === null ? null : h.note(`Based on ${p.exclusionsPupils.toLocaleString('en-GB')} pupils on roll. In a small school one or two cases can move these figures a lot.`);
    // A suppressed or missing figure hides its row rather than showing a dash
    const lines: [string, number | null, string | null][] = [
      ['Suspensions per 100 pupils', p.suspensionRate, typical('exclusionsMedianSuspensionRate', 1)],
      ['Pupils suspended at least once', p.suspendedPupilsPct, typical('exclusionsMedianSuspendedPupilsPct', 1, '%')],
      ['Permanent exclusions (pupils)', p.permanentExclusions, typical('exclusionsMedianPermanentExclusions', 0)],
    ];
    const shown = lines.filter(([, value]) => value !== null);
    const digits = (label: string) => (label.startsWith('Permanent') ? 0 : 1);
    return h.html`${h.table(
      ['', 'This school', `Typical ${phase}`],
      shown.map(([label, value, national]) => [label, fmt(value, digits(label), label.startsWith('Pupils') ? '%' : ''), national]),
    )}${h.note(`One pupil can be suspended more than once, so suspensions per 100 pupils can be higher than the share of pupils suspended. Typical is the median state ${phase}. Rates are not a measure of quality: schools differ in how they use suspension and in their intakes.`)}${pupils}`;
  },
});

export const popupSections: PopupSectionDef[] = [section('secondary'), section('primary')];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'exclusions',
    order: 91,
    about: (meta, h) => h.html`${h.sourceLink('exclusions', 'DfE suspensions and permanent exclusions in England')}${year(meta) ? h.html` (${year(meta)})` : ''}`,
    dates: (meta) => [year(meta) && `Suspensions and exclusions ${year(meta)}`],
  },
];
