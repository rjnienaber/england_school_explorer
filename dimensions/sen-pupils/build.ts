// How many of a school's pupils have special educational needs, for the whole school: the share with an education, health
// and care (EHC) plan and the share on SEN support. From the school level file of DfE's Special educational needs in
// England release. Popup only: these describe the pupils, not how good the school is, and a special school or a school
// with a resourced provision will of course be high.
//
// Overlap with ks2-pupils (primary only): its `ks2SenSupportPct` and `ks2EhcpPct` are the Year 6 pupils who took the KS2
// tests, from the KS2 file, and are kept and labelled Year 6, because they are the group the KS2 results are about.
// These two cover every pupil in the school, and the census module's note points here for SEN.
// The file's breakdown by primary need (the most common need at the school) is not read: it is 640,000 of the file's
// 760,000 rows, and the popup only needs the two totals.

import { defineDimension } from '../../lib/dimension.ts';
import { loadSenPupils, type SenPupils } from './parse.ts';

export const module = defineDimension({
  id: 'sen-pupils',
  title: 'Pupils with special educational needs (whole school)',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    senYear: {
      type: 'string',
      placement: 'detail',
      label: 'SEN figures year',
      description: 'Academic year of the January school census the SEN figures come from, e.g. 2025/26 (the census taken in January 2026)',
      source: 'sen-school',
    },
    senEhcpPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Pupils with an EHC plan (%)',
      description:
        'Percentage of all pupils on roll who have an education, health and care (EHC) plan, the legal document for children with the most complex needs. Whole school, all year groups. Special schools and schools with resourced provision are high by design',
      source: 'sen-school',
      year: 'senYear',
    },
    senSupportPct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Pupils on SEN support (%)',
      description:
        'Percentage of all pupils on roll who have special educational needs and get SEN support from the school, without an EHC plan. Whole school, all year groups. How readily schools identify needs differs, so small gaps mean little',
      source: 'sen-school',
      year: 'senYear',
    },
  },

  async build(ctx) {
    const found = await loadSenPupils(ctx.dataPath('sen-school'));
    const kept = new Map<number, SenPupils>();
    for (const urn of ctx.schools.urns) {
      const s = found.get(urn);
      if (s) kept.set(urn, s);
    }
    const rows = [...kept].map(([urn, s]) => ({ urn, senYear: s.year, senEhcpPct: s.ehcpPct, senSupportPct: s.supportPct }));
    ctx.log(`${rows.length} schools with SEN figures (of ${ctx.schools.urns.size} in scope)`);

    // What a typical state school looks like, for the popup
    const median = (pick: (s: SenPupils) => number) => {
      const m = ctx.stats.nationalMedianAmongState([...kept].map(([urn, s]): [number, number] => [urn, pick(s)]));
      return m === null ? null : ctx.stats.round(m, 1);
    };
    return {
      rows,
      metadata: {
        senYear: rows[0]?.senYear ?? null,
        senMedianEhcpPct: median((s) => s.ehcpPct),
        senMedianSupportPct: median((s) => s.supportPct),
      },
    };
  },
});
