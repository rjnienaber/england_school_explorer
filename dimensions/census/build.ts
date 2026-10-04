// Who attends the school, from the January school census: headcount, free school meals and English as an
// additional language, for the whole school (not just the GCSE year group). Popup only: these describe the
// intake and are not good or bad in themselves. They are flat fields so the intake model and the similar-schools
// comparison can use them as inputs.
//
// Overlaps with existing fields, and why these are separate:
//   - ks4-eal `ealPct` is the share of the GCSE year group only, and only above a minimum number of pupils.
//     `ealPctAll` here covers every pupil in the school.
//   - ks4-disadvantaged covers the GCSE year group and a wider definition (also includes children in care).
//     `fsmPct` is the whole school, for every school in the census.
//   - GIAS `PercentageFSM` is only filled for a subset of schools and can be older, so it is not used.
// SEN shares are not here: they come from a different file (see the sen-pupils module).

import { defineDimension } from '../../lib/dimension.ts';
import { loadCensus, type CensusRow } from './parse.ts';

export const module = defineDimension({
  id: 'census',
  title: 'Pupil mix (school census)',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    censusYear: {
      type: 'string',
      placement: 'detail',
      label: 'School census year',
      description: 'Academic year of the January school census the pupil numbers and percentages come from, e.g. 2025/26 (the census taken in January 2026)',
      source: 'census',
    },
    censusPupils: {
      type: 'number',
      decimals: 0,
      placement: 'detail',
      label: 'Pupils on roll (school census)',
      description: 'Number of pupils on roll at the January school census (headcount, including any sixth form). Can differ from the figure in the school register, which is updated at other times',
      source: 'census',
      year: 'censusYear',
    },
    fsmPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Pupils eligible for free school meals (%)',
      description:
        'Percentage of all pupils at the school who were eligible for free school meals on census day, whether or not they took the meal. A common measure of how many pupils come from low-income families. Blank for independent schools and where suppressed',
      source: 'census',
      year: 'censusYear',
    },
    ealPctAll: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Pupils with English as an additional language, whole school (%)',
      description:
        'Percentage of all pupils at the school whose first language is known or believed to be other than English. Unlike the GCSE-year figure, this covers every year group. Blank for independent schools and where suppressed',
      source: 'census',
      year: 'censusYear',
    },
  },

  async build(ctx) {
    const all = await loadCensus(ctx.dataPath('census'));
    const inScope = [...all].filter(([urn]) => ctx.schools.urns.has(urn));
    const year = inScope[0]?.[1].year ?? null;

    // National comparison: the median across state-funded mainstream schools
    const median = (pick: (c: CensusRow) => number | null, decimals: number) => {
      const pairs = inScope.flatMap(([urn, c]) => {
        const v = pick(c);
        return v === null ? [] : [[urn, v] as [number, number]];
      });
      const m = ctx.stats.nationalMedianAmongState(pairs);
      return m === null ? null : ctx.stats.round(m, decimals);
    };

    const rows = inScope.map(([urn, c]) => ({
      urn,
      censusYear: c.year,
      censusPupils: c.pupils,
      fsmPct: c.fsmPct,
      ealPctAll: c.ealPct,
    }));
    ctx.log(`${rows.length} schools with census figures for ${year} (of ${ctx.schools.urns.size} in scope)`);

    return {
      rows,
      metadata: {
        censusYear: year,
        censusMedianPupils: median((c) => c.pupils, 0),
        censusMedianFsmPct: median((c) => c.fsmPct, 1),
        censusMedianEalPct: median((c) => c.ealPct, 1),
      },
    };
  },
});
