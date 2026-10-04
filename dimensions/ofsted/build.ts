// Ofsted: the latest inspection outcome per school, under whichever framework applies.

import { defineDimension } from '../../lib/dimension.ts';
import { OFSTED_FRAMEWORKS, OFSTED_SUMMARIES, REPORT_CARD_GRADES } from './grades.ts';
import { loadOfsted } from './parse.ts';

/** ".../latest_inspections_as_at_31_August_2026.csv" → "31 August 2026" */
function ofstedAsAt(url: string | undefined): string | null {
  const m = url?.match(/as_at_(\d{1,2})_([A-Za-z]+)_(\d{4})/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : null;
}

const rcGrade = (label: string) =>
  ({ type: 'enum', values: REPORT_CARD_GRADES, placement: 'detail', label, source: 'ofsted' }) as const;
const oeifGrade = (label: string) => ({ type: 'enum', values: [1, 2, 3, 4], placement: 'detail', label, source: 'ofsted' }) as const;

export const module = defineDimension({
  id: 'ofsted',
  title: 'Ofsted inspections',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    ofstedUrl: { type: 'string', placement: 'detail', label: 'Ofsted reports page', source: 'ofsted' },
    ofstedFramework: {
      type: 'enum',
      values: OFSTED_FRAMEWORKS,
      placement: 'detail',
      label: 'Inspection framework',
      description: "'ungraded' = only a short inspection is on file (its graded one predates the 2019 framework)",
      source: 'ofsted',
    },
    ofstedDate: { type: 'string', placement: 'detail', label: 'Inspection publication date', description: 'ISO date', source: 'ofsted' },
    ofstedPredecessor: {
      type: 'boolean',
      placement: 'detail',
      label: 'Inspection was of a predecessor school',
      description: 'True when the latest graded inspection was of a predecessor school (e.g. before academy conversion)',
      source: 'ofsted',
      nullable: false,
      default: false,
    },
    ofstedSummary: {
      type: 'enum',
      values: OFSTED_SUMMARIES,
      placement: 'mode',
      label: 'Ofsted summary',
      description: 'Our own four-level summary so both frameworks share one colour scale; not an Ofsted grade',
      source: 'ofsted',
      year: 'ofstedDate',
    },
    rcSafeguarding: { type: 'string', placement: 'detail', label: 'Report card: safeguarding', description: 'Met or Not met', source: 'ofsted' },
    rcInclusion: rcGrade('Report card: inclusion'),
    rcCurriculum: rcGrade('Report card: curriculum and teaching'),
    rcAchievement: rcGrade('Report card: achievement'),
    rcAttendance: rcGrade('Report card: attendance and behaviour'),
    rcPersonalDevelopment: rcGrade('Report card: personal development and wellbeing'),
    rcPost16: rcGrade('Report card: post-16 provision'),
    rcLeadership: rcGrade('Report card: leadership and governance'),
    oeifOverall: oeifGrade('OEIF: overall effectiveness'),
    oeifQuality: oeifGrade('OEIF: quality of education'),
    oeifBehaviour: oeifGrade('OEIF: behaviour and attitudes'),
    oeifPersonalDevelopment: oeifGrade('OEIF: personal development'),
    oeifLeadership: oeifGrade('OEIF: leadership and management'),
    oeifSixthForm: oeifGrade('OEIF: sixth form provision'),
    oeifDate: { type: 'string', placement: 'detail', label: 'OEIF inspection publication date', description: 'ISO date', source: 'ofsted' },
    ungradedOutcome: { type: 'string', placement: 'detail', label: 'Short inspection outcome', source: 'ofsted' },
    ungradedDate: { type: 'string', placement: 'detail', label: 'Short inspection publication date', description: 'ISO date', source: 'ofsted' },
  },

  async build(ctx) {
    const ofsted = await loadOfsted(ctx.dataPath('ofsted'));
    ctx.log(`Ofsted: ${ofsted.size} schools`);
    const rows = [];
    for (const { urn } of ctx.schools.all) {
      const o = ofsted.get(urn);
      if (!o) continue;
      rows.push({
        urn,
        ofstedUrl: o.url,
        ofstedFramework: o.framework,
        ofstedDate: o.date,
        ofstedPredecessor: o.predecessor,
        ofstedSummary: o.summary,
        rcSafeguarding: o.rc.safeguarding,
        rcInclusion: o.rc.inclusion,
        rcCurriculum: o.rc.curriculum,
        rcAchievement: o.rc.achievement,
        rcAttendance: o.rc.attendance,
        rcPersonalDevelopment: o.rc.personalDevelopment,
        rcPost16: o.rc.post16,
        rcLeadership: o.rc.leadership,
        oeifOverall: o.oeif.overall,
        oeifQuality: o.oeif.quality,
        oeifBehaviour: o.oeif.behaviour,
        oeifPersonalDevelopment: o.oeif.personalDevelopment,
        oeifLeadership: o.oeif.leadership,
        oeifSixthForm: o.oeif.sixthForm,
        oeifDate: o.oeif.date,
        ungradedOutcome: o.ungradedOutcome,
        ungradedDate: o.ungradedDate,
      });
    }
    return { rows, metadata: { ofstedAsAt: ofstedAsAt(ctx.sources.ofsted) } };
  },
});
