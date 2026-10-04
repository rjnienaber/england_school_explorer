// Who the Year 6 pupils are at a primary school: the share who are disadvantaged, have special educational needs or
// speak English as an additional language, from the same DfE school-information file as the KS2 cohort sizes (so this
// module reads the `ks2-info` source that ks2-results downloads). Popup only: these describe the pupils, not how
// good the school is, and they are for the Year 6 group that took the tests, not the whole school (the census module
// has the whole-school free school meals and EAL shares).

import { defineDimension } from '../../lib/dimension.ts';
import { academicYear } from '../../lib/ees.ts';
import { num } from '../../lib/csv.ts';

interface PupilMix {
  year: string;
  disadvantagedPct: number | null;
  senSupportPct: number | null;
  ehcpPct: number | null;
  ealPct: number | null;
}

/** A percentage of pupils; anything outside 0-100 (a DfE code that slipped through) is treated as missing. */
const pct = (value: string | undefined) => {
  const n = num(value);
  return n !== null && n >= 0 && n <= 100 ? n : null;
};

export const module = defineDimension({
  id: 'ks2-pupils',
  title: 'Year 6 pupils (KS2 school information)',
  dependsOn: ['gias-core'],
  phases: ['primary'],
  fields: {
    ks2PupilsYear: {
      type: 'string',
      placement: 'detail',
      label: 'Year 6 pupil mix year',
      description: 'Academic year of the Year 6 pupil figures, e.g. 2024/25',
      source: 'ks2-info',
    },
    ks2DisadvantagedPct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'detail',
      label: 'Year 6 pupils who are disadvantaged (%)',
      description:
        'Percentage of the pupils who took the KS2 tests who are disadvantaged: eligible for free school meals at any point in the last six years, or looked after by a local authority, or adopted from care. The DfE\'s main measure of how many pupils come from low-income families. Year 6 only, not the whole school',
      source: 'ks2-info',
      year: 'ks2PupilsYear',
    },
    ks2SenSupportPct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'detail',
      label: 'Year 6 pupils with SEN support (%)',
      description: 'Percentage of the pupils who took the KS2 tests who have special educational needs and receive SEN support from the school, without an education, health and care (EHC) plan. Year 6 only, not the whole school',
      source: 'ks2-info',
      year: 'ks2PupilsYear',
    },
    ks2EhcpPct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'detail',
      label: 'Year 6 pupils with an EHC plan (%)',
      description: 'Percentage of the pupils who took the KS2 tests who have an education, health and care (EHC) plan, the legal document for children with the most complex needs. Year 6 only, not the whole school',
      source: 'ks2-info',
      year: 'ks2PupilsYear',
    },
    ks2EalPct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'detail',
      label: 'Year 6 pupils with English as an additional language (%)',
      description: 'Percentage of the pupils who took the KS2 tests whose first language is known or believed to be other than English. Year 6 only; the census module has the whole-school figure',
      source: 'ks2-info',
      year: 'ks2PupilsYear',
    },
  },

  async build(ctx) {
    const found = new Map<number, PupilMix>();
    for await (const r of ctx.csv('ks2-info')) {
      const urn = num(r.school_urn);
      if (urn === null || !ctx.schools.urns.has(urn)) continue;
      const mix: PupilMix = {
        year: academicYear(r.time_period),
        disadvantagedPct: pct(r.ptfsm6cla1a),
        senSupportPct: pct(r.psenelk),
        ehcpPct: pct(r.psenele),
        ealPct: pct(r.ptealgrp2),
      };
      if (mix.disadvantagedPct !== null || mix.senSupportPct !== null || mix.ehcpPct !== null || mix.ealPct !== null) found.set(urn, mix);
    }
    const rows = [...found].map(([urn, m]) => ({
      urn,
      ks2PupilsYear: m.year,
      ks2DisadvantagedPct: m.disadvantagedPct,
      ks2SenSupportPct: m.senSupportPct,
      ks2EhcpPct: m.ehcpPct,
      ks2EalPct: m.ealPct,
    }));
    ctx.log(`${rows.length} schools with Year 6 pupil figures (of ${ctx.schools.urns.size} in scope)`);

    // What a typical state primary looks like, for the popup
    const median = (pick: (m: PupilMix) => number | null) => {
      const pairs = [...found].flatMap(([urn, m]): [number, number][] => {
        const v = pick(m);
        return v === null ? [] : [[urn, v]];
      });
      const m = ctx.stats.nationalMedianAmongState(pairs);
      return m === null ? null : ctx.stats.round(m, 0);
    };
    return {
      rows,
      metadata: {
        ks2PupilsYear: rows[0]?.ks2PupilsYear ?? null,
        ks2PupilsMedianDisadvantagedPct: median((m) => m.disadvantagedPct),
        ks2PupilsMedianSenSupportPct: median((m) => m.senSupportPct),
        ks2PupilsMedianEhcpPct: median((m) => m.ehcpPct),
        ks2PupilsMedianEalPct: median((m) => m.ealPct),
      },
    };
  },
});
