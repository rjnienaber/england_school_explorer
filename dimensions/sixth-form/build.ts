// Sixth form results (A level, latest year) for state-funded mainstream schools that enter A level students.
// Popup-only apart from the value-added band, which colours the "Sixth form progress" map mode.

import { defineDimension } from '../../lib/dimension.ts';
import { gradeOfPoints, VA_BANDS } from './grades.ts';
import { loadSixthForm, type SixthFormRow } from './parse.ts';

const field = { source: 'ks5', year: 'ks5Year' } as const;

export const module = defineDimension({
  id: 'sixth-form',
  title: 'Sixth form results',
  dependsOn: ['gias-core'],
  fields: {
    ks5Year: {
      type: 'string',
      placement: 'detail',
      label: 'Sixth form results year',
      description: 'Year the students finished their 16 to 18 courses, e.g. 2024/25',
      source: 'ks5',
    },
    alevelStudents: {
      type: 'number',
      placement: 'detail',
      label: 'Students counted in A level results',
      description: 'Students at the end of their 16 to 18 study with A level entries. The fewer students, the more one student moves each figure',
      ...field,
    },
    alevelGrade: {
      type: 'string',
      placement: 'detail',
      label: 'Average A level grade',
      description: 'Average grade per A level entry, e.g. B-. DfE converts average points per entry (A* is 60, A 50, B 40, and so on) to a grade',
      ...field,
    },
    alevelBest3Grade: {
      type: 'string',
      placement: 'detail',
      label: 'Best three A levels, average grade',
      description: 'Average grade across each student\'s best three A levels. Only published where enough students took three A levels',
      ...field,
    },
    alevelAabPct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'detail',
      label: 'Students with AAB or better',
      description: 'Percentage of students with at least AAB in their best three A levels, at least two of them in facilitating subjects',
      ...field,
    },
    alevelVa: {
      type: 'number',
      decimals: 2,
      placement: 'detail',
      label: 'A level value added',
      description: 'DfE\'s A level progress measure: how far students\' grades are above or below those of students with the same GCSE results elsewhere, in grades per entry (0 is average)',
      ...field,
    },
    alevelVaLower: { type: 'number', decimals: 2, placement: 'detail', label: 'A level value added, lower 95% confidence limit', ...field },
    alevelVaUpper: { type: 'number', decimals: 2, placement: 'detail', label: 'A level value added, upper 95% confidence limit', ...field },
    alevelVaBand: {
      type: 'enum',
      values: VA_BANDS,
      placement: 'mode',
      label: 'A level progress band',
      description: 'DfE\'s band for A level value added: above or below average only when the whole confidence interval is',
      ...field,
    },
    sixthRetainedPct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'detail',
      label: 'Students who stayed to the end of their courses',
      description: 'Percentage of students who started a 16 to 18 course in the school and were still on it at the end (retention)',
      ...field,
    },
  },

  async build(ctx) {
    const all = await loadSixthForm(ctx.dataPath('ks5'));
    const inScope = [...all].filter(([urn]) => ctx.schools.urns.has(urn));
    const year = inScope[0]?.[1].year ?? null;

    // The typical school: median across state-funded mainstream schools, as a grade for the two grade rows
    const median = (pick: (r: SixthFormRow) => number | null) => {
      const pairs = inScope.flatMap(([urn, r]) => {
        const v = pick(r);
        return v === null ? [] : [[urn, v] as [number, number]];
      });
      return ctx.stats.nationalMedianAmongState(pairs);
    };
    const gradeMedian = (pick: (r: SixthFormRow) => number | null) => {
      const m = median(pick);
      return m === null ? null : gradeOfPoints(m);
    };
    const pctMedian = (pick: (r: SixthFormRow) => number | null) => {
      const m = median(pick);
      return m === null ? null : ctx.stats.round(m, 0);
    };

    const rows = inScope.map(([urn, r]) => ({
      urn,
      ks5Year: r.year,
      alevelStudents: r.students,
      alevelGrade: r.grade,
      alevelBest3Grade: r.best3Grade,
      alevelAabPct: r.aabPct,
      alevelVa: r.va,
      alevelVaLower: r.vaLower,
      alevelVaUpper: r.vaUpper,
      alevelVaBand: r.vaBand,
      sixthRetainedPct: r.retainedPct,
    }));
    ctx.log(`${rows.length} schools with A level results for ${year}`);

    return {
      rows,
      metadata: {
        ks5Year: year,
        alevelMedianGrade: gradeMedian((r) => r.aps),
        alevelMedianBest3Grade: gradeMedian((r) => r.best3Aps),
        alevelMedianAabPct: pctMedian((r) => r.aabPct),
        sixthMedianRetainedPct: pctMedian((r) => r.retainedPct),
      },
    };
  },
});
