// Where Year 11 leavers went next (latest published leaver year), for state-funded mainstream secondary schools.
// Shown in the popup only: it is a result of the pupil intake and the local post-16 options as much as of the school.

import { defineDimension } from '../../lib/dimension.ts';
import { loadDestinations, type DestinationsRow } from './parse.ts';

const pct = (label: string, description: string) =>
  ({
    type: 'number',
    decimals: 0,
    unit: '%',
    placement: 'detail',
    label,
    description,
    source: 'destinations',
    year: 'destYear',
  }) as const;

export const module = defineDimension({
  id: 'destinations',
  title: 'Destinations after Year 11',
  dependsOn: ['gias-core'],
  fields: {
    destYear: {
      type: 'string',
      placement: 'detail',
      label: 'Destinations leaver year',
      description: 'Year pupils finished Year 11 (key stage 4), e.g. 2022/23. Their destinations are measured the following school year',
      source: 'destinations',
    },
    destCohort: {
      type: 'number',
      placement: 'detail',
      label: 'Leavers counted in destinations',
      description: 'Number of pupils who finished Year 11 that year. The fewer pupils, the more one pupil moves each percentage',
      source: 'destinations',
      year: 'destYear',
    },
    destSustained: pct('Sustained destination', 'Percentage of leavers in education, an apprenticeship or work for a full period (October to March) the year after Year 11'),
    destSchoolSixth: pct('School sixth form', 'Percentage of leavers in a school sixth form the year after Year 11'),
    destSixthCollege: pct('Sixth form college', 'Percentage of leavers in a sixth form college the year after Year 11'),
    destFe: pct('Further education college', 'Percentage of leavers in a further education college the year after Year 11'),
    destApprenticeship: pct('Apprenticeship', 'Percentage of leavers in an apprenticeship the year after Year 11'),
    destWork: pct('Employment', 'Percentage of leavers in sustained employment (or training) the year after Year 11'),
    destNotSustained: pct('Not sustained', 'Percentage of leavers who were not in education, an apprenticeship or work for the full period, or whose destination did not last. Leavers whose destination is unknown are counted separately and are not included'),
  },

  async build(ctx) {
    const all = await loadDestinations(ctx.dataPath('destinations'));
    const inScope = [...all].filter(([urn]) => ctx.schools.urns.has(urn));
    const year = inScope[0]?.[1].year ?? null;

    // National comparison: the median across state-funded mainstream schools
    const median = (pick: (e: DestinationsRow) => number | null) => {
      const pairs = inScope.flatMap(([urn, e]) => {
        const v = pick(e);
        return v === null ? [] : [[urn, v] as [number, number]];
      });
      const m = ctx.stats.nationalMedianAmongState(pairs);
      return m === null ? null : ctx.stats.round(m, 0);
    };

    const rows = inScope.map(([urn, e]) => ({
      urn,
      destYear: e.year,
      destCohort: e.cohort,
      destSustained: e.sustained,
      destSchoolSixth: e.schoolSixth,
      destSixthCollege: e.sixthCollege,
      destFe: e.fe,
      destApprenticeship: e.apprenticeship,
      destWork: e.work,
      destNotSustained: e.notSustained,
    }));
    ctx.log(`${rows.length} schools with destination figures for ${year} leavers`);

    return {
      rows,
      metadata: {
        destYear: year,
        destMedianSustained: median((e) => e.sustained),
        destMedianSchoolSixth: median((e) => e.schoolSixth),
        destMedianSixthCollege: median((e) => e.sixthCollege),
        destMedianFe: median((e) => e.fe),
        destMedianApprenticeship: median((e) => e.apprenticeship),
        destMedianWork: median((e) => e.work),
        destMedianNotSustained: median((e) => e.notSustained),
      },
    };
  },
});
