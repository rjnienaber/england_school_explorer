import { OEIF_GRADES, OFSTED_SUMMARIES, type OeifGrade, type OfstedSummary } from './grades.ts';
import { formatDate, type ModeDef, type PopupSectionDef, type RowEntry, type SourceNoteDef } from '../../web/toolkit.ts';

const OFSTED_LABELS: Record<OfstedSummary, string> = {
  top: 'Outstanding, or mostly Strong/Exceptional',
  good: 'Good / Expected standard',
  concern: 'Requires improvement / Needs attention',
  serious: 'Inadequate / Urgent improvement',
};
const OFSTED_SHORT: Record<OfstedSummary, string> = {
  top: 'Outstanding',
  good: 'Good',
  concern: 'Needs improving',
  serious: 'Serious concern',
};
const OFSTED_COLOURS: Record<OfstedSummary, number> = { top: 4, good: 3, concern: 1, serious: 0 };

export const modes: ModeDef[] = [
  {
    id: 'ofsted',
    label: 'Ofsted',
    order: 40,
    description:
      'Latest inspection. Since November 2025, schools get report cards graded in several areas, not one overall grade. ' +
      'Report cards here are summarised by their lowest area grade (or "mostly Strong" when at least half the areas are Strong or Exceptional). ' +
      'This is our simplification. Older grades may be many years old.',
    buckets: OFSTED_SUMMARIES.map((s) => ({ label: OFSTED_LABELS[s], colour: OFSTED_COLOURS[s] })),
    bucketOf: (p) => (p.ofstedSummary ? OFSTED_SUMMARIES.indexOf(p.ofstedSummary) : null),
    sortValue: (p) => (p.ofstedSummary ? 3 - OFSTED_SUMMARIES.indexOf(p.ofstedSummary) : null),
    formatValue: (p) => (p.ofstedSummary ? OFSTED_SHORT[p.ofstedSummary] : '–'),
  },
];

const oeif = (g: OeifGrade | null) => (g === null ? null : OEIF_GRADES[g]);
/** Rows for the areas that have a value. */
const present = (areas: [string, string | null][]): RowEntry[] => areas.filter(([, v]) => v).map(([k, v]) => [k, v]);

export const popupSections: PopupSectionDef[] = [
  {
    id: 'ofsted',
    order: 30,
    title: 'Ofsted',
    render(p, h) {
      const reports = p.ofstedUrl ? h.html` · ${h.link(p.ofstedUrl, 'reports')}` : null;
      const predecessor = p.ofstedPredecessor
        ? h.note('This inspection was of a predecessor school, e.g. before it became an academy.')
        : null;
      let body;

      if (p.ofstedFramework === 'report-card') {
        body = h.html`${h.meta(h.html`Report card, ${formatDate(p.ofstedDate)}${reports}`)}${h.rows(
          present([
            ['Inclusion', p.rcInclusion],
            ['Curriculum and teaching', p.rcCurriculum],
            ['Achievement', p.rcAchievement],
            ['Attendance and behaviour', p.rcAttendance],
            ['Personal development', p.rcPersonalDevelopment],
            ['Leadership and governance', p.rcLeadership],
            ['Post-16', p.rcPost16],
            ['Safeguarding', p.rcSafeguarding],
          ]),
        )}`;
      } else if (p.ofstedFramework === 'oeif') {
        const later =
          p.ungradedOutcome && p.ungradedDate && p.oeifDate && p.ungradedDate > p.oeifDate
            ? h.note(`Later short inspection (${formatDate(p.ungradedDate)}): ${p.ungradedOutcome}`)
            : null;
        body = h.html`${h.meta(h.html`Graded inspection, ${formatDate(p.oeifDate)}${reports}`)}${h.rows(
          present([
            ['Overall effectiveness', oeif(p.oeifOverall) ?? 'Not given (from Sept 2024)'],
            ['Quality of education', oeif(p.oeifQuality)],
            ['Behaviour and attitudes', oeif(p.oeifBehaviour)],
            ['Personal development', oeif(p.oeifPersonalDevelopment)],
            ['Leadership and management', oeif(p.oeifLeadership)],
            ['Sixth form', oeif(p.oeifSixthForm)],
          ]),
        )}${later}`;
      } else if (p.ofstedFramework === 'ungraded') {
        body = h.html`${h.meta(h.html`Short inspection, ${formatDate(p.ungradedDate)}${reports}`)}${h.rows([['Outcome', p.ungradedOutcome ?? '']])}${h.note(
          'Its last full graded inspection was before 2019 and isn’t in Ofsted’s current data.',
        )}`;
      } else if (p.sector === 'independent') {
        body = h.note('Most independent schools are inspected by the ISI, not Ofsted.');
      } else {
        body = h.note(h.html`No inspection on record. It may be new${reports}.`);
      }
      return h.html`${body}${predecessor}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'ofsted',
    order: 30,
    about: (meta, h) =>
      h.html`${h.sourceLink('ofsted', 'Ofsted management information')}${meta.ofstedAsAt ? ` as at ${meta.ofstedAsAt as string}` : ''}`,
    dates: (meta) => [meta.ofstedAsAt ? `Ofsted to ${meta.ofstedAsAt as string}` : null],
  },
];
