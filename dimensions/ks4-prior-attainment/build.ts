// GCSE results by starting point: how pupils who were low, middle or high attainers at the end
// of primary school (KS2) did at each school. Reads the KS4 file owned by ks4-headline.
// Prior attainment needs KS2 test results, so the 2024/25 and 2025/26 cohorts (who sat none
// during COVID) have no rows: each school gets its latest year that has any group's results.

import { defineDimension, type NumberField, type EnumField } from '../../lib/dimension.ts';
import { P8_BANDS, p8Band } from '../ks4-headline/bands.ts';
import { PRIOR_GROUPS, PRIOR_LABELS, type PriorGroup } from './groups.ts';
import { loadPriorAttainment, type PriorResults } from './parse.ts';

type GroupFields<G extends PriorGroup> = Record<`prior${G}${'Pct' | 'Att8' | 'P8' | 'P8Lower' | 'P8Upper'}`, NumberField> &
  Record<`prior${G}P8Band`, EnumField & { values: typeof P8_BANDS }>;

/** The six fields of one group, e.g. priorLowPct ... priorLowP8Band. All are popup-only. */
function groupFields<const G extends PriorGroup>(g: G): GroupFields<G> {
  const who = `${PRIOR_LABELS[g].toLowerCase()} prior attainers`;
  const number = (label: string, description?: string): NumberField => ({
    type: 'number',
    placement: 'detail',
    label: `${label}, ${who}`,
    description,
    source: 'ks4',
    year: 'priorYear',
  });
  return {
    [`prior${g}Pct`]: number('Share of the year group (%)'),
    [`prior${g}Att8`]: number('Attainment 8'),
    [`prior${g}P8`]: number('Progress 8'),
    [`prior${g}P8Lower`]: number('Progress 8, lower 95% confidence limit'),
    [`prior${g}P8Upper`]: number('Progress 8, upper 95% confidence limit'),
    [`prior${g}P8Band`]: {
      type: 'enum',
      values: P8_BANDS,
      placement: 'detail',
      label: `Progress 8 band, ${who}`,
      description: 'Above or below average only when the whole confidence interval is',
      source: 'ks4',
      year: 'priorYear',
    },
  } as GroupFields<G>;
}

const hasResults = (r: PriorResults) => r.att8 !== null || r.p8 !== null;

export const module = defineDimension({
  id: 'ks4-prior-attainment',
  title: 'GCSE results by starting point (KS4)',
  dependsOn: ['gias-core'],
  fields: {
    priorYear: {
      type: 'string',
      placement: 'detail',
      label: 'Results-by-starting-point year',
      description: 'Latest year with results for any prior-attainment group (needs KS2 results, so it can be older than the headline GCSE year)',
      source: 'ks4',
    },
    ...groupFields('Low'),
    ...groupFields('Mid'),
    ...groupFields('High'),
  },

  async build(ctx) {
    const prior = await loadPriorAttainment(ctx.dataPath('ks4'));

    const rows = [];
    for (const { urn } of ctx.schools.all) {
      const years = prior.get(urn);
      if (!years) continue;
      // Latest year in which at least one group has published results
      const label = [...years.keys()].sort().reverse().find((y) => [...years.get(y)!.values()].some(hasResults));
      if (!label) continue;

      const row: Record<string, unknown> = { urn, priorYear: label };
      for (const g of PRIOR_GROUPS) {
        const r = years.get(label)!.get(g);
        // A group with no pupils (or fully suppressed) has no results: leave it null, not zero
        if (!r || !hasResults(r)) continue;
        row[`prior${g}Pct`] = r.pct;
        row[`prior${g}Att8`] = r.att8;
        row[`prior${g}P8`] = r.p8;
        row[`prior${g}P8Lower`] = r.p8Lower;
        row[`prior${g}P8Upper`] = r.p8Upper;
        row[`prior${g}P8Band`] = r.p8 !== null && r.p8Lower !== null && r.p8Upper !== null ? p8Band(r.p8, r.p8Lower, r.p8Upper) : null;
      }
      rows.push(row as { urn: number });
    }

    ctx.log(`${rows.length} schools with results by starting point`);
    return rows;
  },
});
