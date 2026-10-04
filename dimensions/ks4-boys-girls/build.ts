// Boys' and girls' GCSE results in mixed schools. Uses the same year as the headline results, and
// reads the KS4 file owned by ks4-headline. Single-sex schools have no row.

import { defineDimension } from '../../lib/dimension.ts';
import { MIN_SEX_PUPILS } from './constants.ts';
import { loadSexResults } from './parse.ts';

export const module = defineDimension({
  id: 'ks4-boys-girls',
  title: 'Boys and girls GCSE results (KS4)',
  dependsOn: ['gias-core', 'ks4-headline'],
  fields: {
    sexYear: {
      type: 'string',
      placement: 'detail',
      label: 'Boys and girls results year',
      description: 'Same year as the headline GCSE results',
      source: 'ks4',
    },
    att8Boys: {
      type: 'number',
      placement: 'detail',
      label: 'Attainment 8 of boys',
      description: `Average GCSE score of boys. Only for mixed schools with at least ${MIN_SEX_PUPILS} boys and ${MIN_SEX_PUPILS} girls`,
      source: 'ks4',
      year: 'sexYear',
    },
    att8Girls: {
      type: 'number',
      placement: 'detail',
      label: 'Attainment 8 of girls',
      description: `Average GCSE score of girls. Only for mixed schools with at least ${MIN_SEX_PUPILS} boys and ${MIN_SEX_PUPILS} girls`,
      source: 'ks4',
      year: 'sexYear',
    },
    boysCount: {
      type: 'number',
      placement: 'detail',
      label: 'Boys in year group',
      source: 'ks4',
      year: 'sexYear',
    },
    girlsCount: {
      type: 'number',
      placement: 'detail',
      label: 'Girls in year group',
      source: 'ks4',
      year: 'sexYear',
    },
  },

  async build(ctx) {
    const bySex = await loadSexResults(ctx.dataPath('ks4'));
    const headline = ctx.read('ks4-headline');
    const gias = ctx.read('gias-core');

    const rows = [];
    for (const { urn } of ctx.schools.all) {
      if (gias.get(urn)?.gender !== 'Mixed') continue;
      const label = headline.get(urn)?.ks4Year;
      if (typeof label !== 'string') continue;
      const y = bySex.get(urn)?.get(label);
      const boys = y?.Boys;
      const girls = y?.Girls;
      if (!boys || !girls || boys.att8 === null || girls.att8 === null) continue;
      if ((boys.count ?? 0) < MIN_SEX_PUPILS || (girls.count ?? 0) < MIN_SEX_PUPILS) continue;
      rows.push({
        urn,
        sexYear: label,
        att8Boys: boys.att8,
        att8Girls: girls.att8,
        boysCount: boys.count,
        girlsCount: girls.count,
      });
    }

    ctx.log(`${rows.length} mixed schools with boys and girls results`);
    return rows;
  },
});
