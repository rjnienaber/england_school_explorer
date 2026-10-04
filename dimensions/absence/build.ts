// Pupil absence for the latest full academic year: how much school pupils miss. Published for state-funded
// schools only, so independent schools have no figures. Lower absence is better, so the percentile is
// ranked the other way round (a high percentile means low absence).

import { defineDimension } from '../../lib/dimension.ts';
import { loadAbsence } from './parse.ts';

export const module = defineDimension({
  id: 'absence',
  title: 'Absence',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    absenceYear: {
      type: 'string',
      placement: 'detail',
      label: 'Absence year',
      description: 'Academic year of the absence figures, e.g. 2024/25',
      source: 'absence',
    },
    absencePupils: {
      type: 'number',
      placement: 'detail',
      label: 'Pupils counted in absence figures',
      description:
        'Pupils on roll (enrolments) the absence rates are based on, including any who joined or left during the year. Persistent and severe absence are shares of this number, so it sets how precise they are',
      source: 'absence',
      year: 'absenceYear',
    },
    absenceOverallPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Overall absence rate',
      description: 'Percentage of possible school sessions (half days) missed by pupils, for any reason, authorised or not',
      source: 'absence',
      year: 'absenceYear',
    },
    absenceUnauthorisedPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Unauthorised absence rate',
      description: 'Percentage of possible sessions missed without a reason the school accepted, such as holidays in term time or arriving after registration closed',
      source: 'absence',
      year: 'absenceYear',
    },
    absencePersistentPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'mode',
      label: 'Persistent absence rate',
      description: 'Percentage of pupils who missed 10% or more of their possible sessions (about one day in ten or more), for any reason. Lower is better',
      source: 'absence',
      year: 'absenceYear',
    },
    absenceSeverePct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Severe absence rate',
      description: 'Percentage of pupils who missed 50% or more of their possible sessions (about half of school or more). Lower is better',
      source: 'absence',
      year: 'absenceYear',
    },
    absencePersistentPctile: {
      type: 'number',
      decimals: 0,
      placement: 'mode',
      label: 'Persistent absence percentile',
      description:
        'Percentile (0-100) of the persistent absence rate among state-funded mainstream schools in the same year, ranked so that lower absence gives a higher percentile (100 = lowest absence). Our own ranking, not an official measure',
      source: 'absence',
      year: 'absenceYear',
    },
  },

  async build(ctx) {
    const absence = await loadAbsence(ctx.dataPath('absence'));
    const inScope = [...absence].filter(([urn]) => ctx.schools.urns.has(urn));
    const year = inScope[0]?.[1].year ?? null;

    const pairs = (pick: (a: (typeof inScope)[number][1]) => number | null) =>
      inScope.flatMap(([urn, a]) => {
        const v = pick(a);
        return v === null ? [] : [[urn, v] as [number, number]];
      });
    const persistent = pairs((a) => a.persistentPct);
    const rank = ctx.stats.percentileAmongState(persistent, { higherIsBetter: false });
    const median = (pick: (a: (typeof inScope)[number][1]) => number | null) => {
      const m = ctx.stats.nationalMedianAmongState(pairs(pick));
      return m === null ? null : ctx.stats.round(m, 1);
    };

    const rows = inScope.map(([urn, a]) => ({
      urn,
      absenceYear: a.year,
      absencePupils: a.pupils,
      absenceOverallPct: a.overallPct,
      absenceUnauthorisedPct: a.unauthorisedPct,
      absencePersistentPct: a.persistentPct,
      absenceSeverePct: a.severePct,
      absencePersistentPctile: a.persistentPct !== null && ctx.schools.isState(urn) ? rank(a.persistentPct) : null,
    }));
    const ranked = rows.filter((r) => r.absencePersistentPctile !== null).length;
    ctx.log(`${rows.length} schools with absence figures for ${year}; ${ranked} ranked on persistent absence`);

    return {
      rows,
      // National comparison figures for the popup: the median across state-funded mainstream schools
      metadata: {
        absenceYear: year,
        absenceMedianOverallPct: median((a) => a.overallPct),
        absenceMedianUnauthorisedPct: median((a) => a.unauthorisedPct),
        absenceMedianPersistentPct: median((a) => a.persistentPct),
        absenceMedianSeverePct: median((a) => a.severePct),
      },
    };
  },
});
