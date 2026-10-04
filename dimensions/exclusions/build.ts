// Suspensions and permanent exclusions for the latest full academic year, for state-funded secondary schools.
// Shown in the popup only (no map mode): the numbers are small and noisy, especially in small schools, and a
// school that suspends more is not simply "worse" (some use suspension early to keep classrooms calm).

import { defineDimension } from '../../lib/dimension.ts';
import { loadExclusions, type ExclusionsRow } from './parse.ts';

export const module = defineDimension({
  id: 'exclusions',
  title: 'Suspensions and exclusions',
  dependsOn: ['gias-core'],
  fields: {
    exclusionsYear: {
      type: 'string',
      placement: 'detail',
      label: 'Exclusions year',
      description: 'Academic year of the suspension and permanent exclusion figures, e.g. 2024/25',
      source: 'exclusions',
    },
    exclusionsPupils: {
      type: 'number',
      placement: 'detail',
      label: 'Pupils counted in exclusion figures',
      description: 'Pupils on roll (headcount) the suspension and exclusion rates are based on. The fewer pupils, the more a single case moves the rate',
      source: 'exclusions',
      year: 'exclusionsYear',
    },
    suspensionRate: {
      type: 'number',
      decimals: 1,
      placement: 'detail',
      label: 'Suspensions per 100 pupils',
      description: 'Number of suspensions in the year per 100 pupils on roll. One pupil can be suspended more than once, so this can exceed 100',
      source: 'exclusions',
      year: 'exclusionsYear',
    },
    suspensionCount: {
      type: 'number',
      decimals: 0,
      placement: 'detail',
      label: 'Suspensions',
      description: 'Number of suspensions (fixed-period exclusions) in the year',
      source: 'exclusions',
      year: 'exclusionsYear',
    },
    suspendedPupilsPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Pupils suspended at least once',
      description: 'Percentage of pupils on roll who were suspended one or more times in the year',
      source: 'exclusions',
      year: 'exclusionsYear',
    },
    permanentExclusions: {
      type: 'number',
      decimals: 0,
      placement: 'detail',
      label: 'Permanent exclusions',
      description: 'Number of pupils permanently excluded in the year (expelled from the school). Small numbers, so treat comparisons with care',
      source: 'exclusions',
      year: 'exclusionsYear',
    },
    permanentExclusionRate: {
      type: 'number',
      decimals: 2,
      placement: 'detail',
      label: 'Permanent exclusions per 100 pupils',
      description: 'Permanent exclusions in the year per 100 pupils on roll',
      source: 'exclusions',
      year: 'exclusionsYear',
    },
  },

  async build(ctx) {
    const all = await loadExclusions(ctx.dataPath('exclusions'));
    const inScope = [...all].filter(([urn]) => ctx.schools.urns.has(urn));
    const year = inScope[0]?.[1].year ?? null;

    // National comparison: the median across state-funded mainstream schools
    const median = (pick: (e: ExclusionsRow) => number | null, decimals: number) => {
      const pairs = inScope.flatMap(([urn, e]) => {
        const v = pick(e);
        return v === null ? [] : [[urn, v] as [number, number]];
      });
      const m = ctx.stats.nationalMedianAmongState(pairs);
      return m === null ? null : ctx.stats.round(m, decimals);
    };

    const rows = inScope.map(([urn, e]) => ({
      urn,
      exclusionsYear: e.year,
      exclusionsPupils: e.pupils,
      suspensionRate: e.suspensionRate,
      suspensionCount: e.suspensions,
      suspendedPupilsPct: e.suspendedPupilsPct,
      permanentExclusions: e.permanentExclusions,
      permanentExclusionRate: e.permanentExclusionRate,
    }));
    ctx.log(`${rows.length} schools with suspension and exclusion figures for ${year}`);

    return {
      rows,
      metadata: {
        exclusionsYear: year,
        exclusionsMedianSuspensionRate: median((e) => e.suspensionRate, 1),
        exclusionsMedianSuspendedPupilsPct: median((e) => e.suspendedPupilsPct, 1),
        exclusionsMedianPermanentExclusions: median((e) => e.permanentExclusions, 0),
      },
    };
  },
});
