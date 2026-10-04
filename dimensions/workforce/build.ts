// Teachers: how many, pupils per teacher, how many lack qualified teacher status, and sickness absence. State-funded
// secondary schools. Popup only (no map mode): these are not simple good-or-bad measures (a low ratio can mean a small
// or expensive-to-run school), so no colour scale is offered. Flat fields so the similar-schools comparison can use them.
//
// The publication has no school-level pupil-teacher ratio. `pupilTeacherRatio` is our own calculation: pupils on roll
// at the January school census divided by full-time-equivalent teachers in the November workforce census, so it is
// not the DfE's national figure (which uses full-time-equivalent pupils and qualified teachers only).

import { defineDimension } from '../../lib/dimension.ts';
import { loadSickness, loadWorkforce } from './parse.ts';

export const module = defineDimension({
  id: 'workforce',
  title: 'Staff (school workforce)',
  dependsOn: ['gias-core', 'census'],
  phases: ['secondary', 'primary'],
  fields: {
    workforceYear: {
      type: 'string',
      placement: 'detail',
      label: 'Workforce census year',
      description: 'Academic year of the school workforce census (taken in November) the teacher numbers come from, e.g. 2025/26',
      source: 'workforce',
    },
    teachersFte: {
      type: 'number',
      decimals: 1,
      placement: 'detail',
      label: 'Teachers (full-time equivalent)',
      description: 'Teachers at the school counted as full-time equivalents (two half-time teachers count as one), including the headteacher, deputies and assistant heads',
      source: 'workforce',
      year: 'workforceYear',
    },
    teachersHeadcount: {
      type: 'number',
      decimals: 0,
      placement: 'detail',
      label: 'Teachers (headcount)',
      description: 'Number of teachers employed, counting part-time teachers as one each',
      source: 'workforce',
      year: 'workforceYear',
    },
    pupilTeacherRatio: {
      type: 'number',
      decimals: 1,
      placement: 'detail',
      label: 'Pupils per teacher (our calculation)',
      description:
        'Our own calculation: pupils on roll (January school census) divided by full-time-equivalent teachers (November workforce census). Not the DfE pupil-teacher ratio, which uses full-time-equivalent pupils and qualified teachers only, so it is usually a little higher. Includes sixth-form pupils and teachers. Blank where either figure is missing',
      source: 'workforce',
      year: 'workforceYear',
    },
    unqualifiedTeachersPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Teachers without qualified teacher status (%)',
      description:
        'Full-time-equivalent teachers without qualified teacher status (QTS) as a share of all teachers. Academies and free schools are allowed to employ teachers without QTS, and some are experienced teachers (for example in technical subjects) or people training towards it',
      source: 'workforce',
      year: 'workforceYear',
    },
    partTimeTeachersPct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'detail',
      label: 'Teachers working part time (%)',
      description: 'Share of teachers (by headcount) who work part time',
      source: 'workforce',
      year: 'workforceYear',
    },
    sicknessYear: {
      type: 'string',
      placement: 'detail',
      label: 'Teacher sickness year',
      description: 'Academic year of the teacher sickness absence figures, e.g. 2024/25 (published a year later than the workforce numbers)',
      source: 'workforce-sickness',
    },
    teacherSicknessDays: {
      type: 'number',
      decimals: 1,
      placement: 'detail',
      label: 'Teacher sickness absence (days per teacher a year)',
      description: 'Average days of sickness absence taken per teacher over the year, counting teachers who were not off sick as zero',
      source: 'workforce-sickness',
      year: 'sicknessYear',
    },
    teachersTakingAbsencePct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'detail',
      label: 'Teachers with any sickness absence (%)',
      description: 'Share of teachers who took at least one day of sickness absence during the year',
      source: 'workforce-sickness',
      year: 'sicknessYear',
    },
  },

  async build(ctx) {
    const workforce = await loadWorkforce(ctx.dataPath('workforce'));
    const sickness = await loadSickness(ctx.dataPath('workforce-sickness'));
    const census = ctx.read('census');

    interface Row {
      urn: number;
      workforceYear: string | null;
      teachersFte: number | null;
      teachersHeadcount: number | null;
      pupilTeacherRatio: number | null;
      unqualifiedTeachersPct: number | null;
      partTimeTeachersPct: number | null;
      sicknessYear: string | null;
      teacherSicknessDays: number | null;
      teachersTakingAbsencePct: number | null;
    }
    const rows: Row[] = [];
    for (const urn of ctx.schools.urns) {
      const w = workforce.get(urn);
      const s = sickness.get(urn);
      if (!w && !s) continue;
      const pupils = census.get(urn)?.censusPupils;
      rows.push({
        urn,
        workforceYear: w?.year ?? null,
        teachersFte: w?.teachersFte ?? null,
        teachersHeadcount: w?.teachersHc ?? null,
        pupilTeacherRatio: w && typeof pupils === 'number' ? pupils / w.teachersFte : null,
        unqualifiedTeachersPct: w && w.withoutQtsFte !== null ? Math.min(100, (w.withoutQtsFte / w.teachersFte) * 100) : null,
        partTimeTeachersPct: w?.partTimePct ?? null,
        sicknessYear: s?.year ?? null,
        teacherSicknessDays: s?.daysPerTeacher ?? null,
        teachersTakingAbsencePct: s?.takingAbsencePct ?? null,
      });
    }
    ctx.log(`${rows.filter((r) => r.workforceYear).length} schools with teacher numbers, ${rows.filter((r) => r.sicknessYear).length} with sickness absence (of ${ctx.schools.urns.size} in scope)`);

    // National comparison: the median across state-funded mainstream schools
    const median = (pick: (r: Row) => number | null, decimals: number) => {
      const pairs = rows.flatMap((r) => {
        const v = pick(r);
        return v === null ? [] : [[r.urn, v] as [number, number]];
      });
      const m = ctx.stats.nationalMedianAmongState(pairs);
      return m === null ? null : ctx.stats.round(m, decimals);
    };
    return {
      rows,
      metadata: {
        workforceYear: rows.find((r) => r.workforceYear)?.workforceYear ?? null,
        sicknessYear: rows.find((r) => r.sicknessYear)?.sicknessYear ?? null,
        workforceMedianTeachersFte: median((r) => r.teachersFte, 1),
        workforceMedianPupilTeacherRatio: median((r) => r.pupilTeacherRatio, 1),
        workforceMedianUnqualifiedPct: median((r) => r.unqualifiedTeachersPct, 1),
        workforceMedianPartTimePct: median((r) => r.partTimeTeachersPct, 0),
        workforceMedianSicknessDays: median((r) => r.teacherSicknessDays, 1),
        workforceMedianTakingAbsencePct: median((r) => r.teachersTakingAbsencePct, 0),
      },
    };
  },
});
