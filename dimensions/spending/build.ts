// Spending: total spending per pupil, and the share spent on teaching staff, from the DfE's school finance returns.
// Popup only: how much a school spends is not good or bad in itself (small, sixth-form and special schools cost more
// per pupil), so there is no map mode or colour scale.
//
// Two returns are combined, and they are not identical:
//   - maintained schools (CFR) report for the school itself, for the financial year April to March;
//   - academies (AAR) report each academy's own spending for the academic year, September to August. The DfE's tool then adds
//     a share of the trust's central costs to each academy (by pupil numbers, and by floor area for premises costs). That
//     apportionment is not in the public download, so the academy figure here leaves it out and is lower than the same school
//     shows in the tool. Compare academies with academies, and maintained schools with maintained schools.
// The two files can be for different years: `spendYear` says which.

import { defineDimension } from '../../lib/dimension.ts';
import { loadSpending } from './parse.ts';

export const module = defineDimension({
  id: 'spending',
  title: 'Spending per pupil (school finance)',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    spendYear: {
      type: 'string',
      placement: 'detail',
      label: 'Spending year',
      description: 'Financial year of the spending figures, e.g. 2024/25. Maintained schools report April to March and academies September to August, and the two returns can be published for different years',
      source: 'spending',
    },
    spendBasis: {
      type: 'enum',
      values: ['maintained', 'academy'],
      placement: 'detail',
      label: 'Spending return',
      description:
        'Which return the figures come from: maintained schools (Consistent Financial Reporting) or academies (Academies Accounts Return). Academy figures leave out the share of trust central costs that the DfE benchmarking tool apportions to each academy, so they are lower than the tool shows',
      source: 'spending',
      year: 'spendYear',
    },
    spendPerPupil: {
      type: 'number',
      decimals: 0,
      unit: '£',
      placement: 'detail',
      label: 'Spending per pupil (£)',
      description:
        'Total expenditure for the year divided by pupils on roll, in pounds. Includes sixth-form pupils and all running costs, but not capital spending. Academy figures leave out the trust central costs that the DfE benchmarking tool apportions to each academy. Blank where the school gave no figures or its return covers only part of a year',
      source: 'spending',
      year: 'spendYear',
    },
    teachingStaffSpendPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Spending on teaching staff (%)',
      description: 'Teaching staff costs (salaries, pension and other employer costs of teachers, excluding supply and agency teachers) as a share of total expenditure',
      source: 'spending',
      year: 'spendYear',
    },
  },

  async build(ctx) {
    const spending = await loadSpending(ctx.dataPath('spending'));
    interface Row {
      urn: number;
      spendYear: string;
      spendBasis: 'maintained' | 'academy';
      spendPerPupil: number;
      teachingStaffSpendPct: number | null;
    }
    const rows: Row[] = [];
    for (const urn of ctx.schools.urns) {
      const s = spending.get(urn);
      if (!s) continue;
      rows.push({ urn, spendYear: s.year, spendBasis: s.basis === 'cfr' ? 'maintained' : 'academy', spendPerPupil: s.spendPerPupil, teachingStaffSpendPct: s.teachingStaffSpendPct });
    }
    ctx.log(`${rows.length} schools with spending figures (of ${ctx.schools.urns.size} in scope; ${rows.filter((r) => r.spendBasis === 'academy').length} academies)`);

    // National comparison: the median across state-funded mainstream schools of the same kind, since the two returns differ
    const median = (basis: Row['spendBasis'], pick: (r: Row) => number | null, decimals: number) => {
      const pairs = rows.flatMap((r) => {
        const v = r.spendBasis === basis ? pick(r) : null;
        return v === null ? [] : [[r.urn, v] as [number, number]];
      });
      const m = ctx.stats.nationalMedianAmongState(pairs);
      return m === null ? null : ctx.stats.round(m, decimals);
    };
    const yearOf = (basis: Row['spendBasis']) => rows.find((r) => r.spendBasis === basis)?.spendYear ?? null;
    return {
      rows,
      metadata: {
        spendMaintainedYear: yearOf('maintained'),
        spendAcademyYear: yearOf('academy'),
        spendMedianPerPupilMaintained: median('maintained', (r) => r.spendPerPupil, 0),
        spendMedianPerPupilAcademy: median('academy', (r) => r.spendPerPupil, 0),
        spendMedianTeachingPctMaintained: median('maintained', (r) => r.teachingStaffSpendPct, 1),
        spendMedianTeachingPctAcademy: median('academy', (r) => r.teachingStaffSpendPct, 1),
      },
    };
  },
});
