// GCSE results of pupils whose first language is not English. Uses the same year as the headline
// results, and reads the KS4 file owned by ks4-headline.

import { defineDimension } from '../../lib/dimension.ts';
import { MIN_EAL_PUPILS } from './constants.ts';
import { loadEal } from './parse.ts';

export const module = defineDimension({
  id: 'ks4-eal',
  title: 'English as an additional language GCSE results (KS4)',
  dependsOn: ['gias-core', 'ks4-headline'],
  fields: {
    ealYear: {
      type: 'string',
      placement: 'detail',
      label: 'English as an additional language results year',
      description: 'Same year as the headline GCSE results',
      source: 'ks4',
    },
    ealPct: {
      type: 'number',
      placement: 'detail',
      label: 'Pupils with English as an additional language (%)',
      description: `Share of the GCSE year group whose first language is known or believed to be other than English. Only shown with at least ${MIN_EAL_PUPILS} such pupils`,
      source: 'ks4',
      year: 'ealYear',
      unit: '%',
      decimals: 1,
    },
    att8Eal: {
      type: 'number',
      placement: 'detail',
      label: 'Attainment 8 of pupils with English as an additional language',
      description: `Average GCSE score of pupils whose first language is known or believed to be other than English. Only shown with at least ${MIN_EAL_PUPILS} such pupils. Compare with the school's overall Attainment 8, as there is no figure for English-speaking pupils`,
      source: 'ks4',
      year: 'ealYear',
      decimals: 1,
    },
  },

  async build(ctx) {
    const byUrn = await loadEal(ctx.dataPath('ks4'));
    const headline = ctx.read('ks4-headline');

    const rows = [];
    for (const { urn } of ctx.schools.all) {
      const label = headline.get(urn)?.ks4Year;
      if (typeof label !== 'string') continue;
      const y = byUrn.get(urn)?.get(label);
      if (!y || y.count === null || y.count < MIN_EAL_PUPILS) continue;
      if (y.percent === null && y.att8 === null) continue;
      rows.push({ urn, ealYear: label, ealPct: y.percent, att8Eal: y.att8 });
    }

    ctx.log(`${rows.length} schools with results for pupils with English as an additional language`);
    return rows;
  },
});
