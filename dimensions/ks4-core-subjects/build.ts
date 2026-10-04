// Average English and maths grades, from the same year as the headline GCSE results. Reads the KS4 file
// owned by ks4-headline.

import { defineDimension } from '../../lib/dimension.ts';
import { loadCoreSubjects } from './parse.ts';

export const module = defineDimension({
  id: 'ks4-core-subjects',
  title: 'Average English and maths grades (KS4)',
  dependsOn: ['gias-core', 'ks4-headline'],
  fields: {
    coreSubjectsYear: {
      type: 'string',
      placement: 'detail',
      label: 'English and maths grades year',
      description: 'Same year as the headline GCSE results',
      source: 'ks4',
    },
    englishGrade: {
      type: 'number',
      placement: 'detail',
      label: 'Average English grade (1-9)',
      description:
        'Average GCSE grade in English (language or literature, whichever is higher) across the year group, on the 1-9 scale. Derived: DfE publishes English as Attainment 8 points over two slots, which we halve. Missing where no results count towards Attainment 8 (for example IGCSEs)',
      source: 'ks4',
      year: 'coreSubjectsYear',
      decimals: 1,
    },
    mathsGrade: {
      type: 'number',
      placement: 'detail',
      label: 'Average maths grade (1-9)',
      description:
        'Average GCSE grade in maths across the year group, on the 1-9 scale. Derived: DfE publishes maths as Attainment 8 points over two slots, which we halve. Missing where no results count towards Attainment 8 (for example IGCSEs)',
      source: 'ks4',
      year: 'coreSubjectsYear',
      decimals: 1,
    },
  },

  async build(ctx) {
    const byUrn = await loadCoreSubjects(ctx.dataPath('ks4'));
    const headline = ctx.read('ks4-headline');

    const rows = [];
    for (const { urn } of ctx.schools.all) {
      const label = headline.get(urn)?.ks4Year;
      if (typeof label !== 'string') continue;
      const y = byUrn.get(urn)?.get(label);
      if (!y || (y.englishGrade === null && y.mathsGrade === null)) continue;
      rows.push({ urn, coreSubjectsYear: label, ...y });
    }

    ctx.log(`${rows.length} schools with English and maths grades`);
    return rows;
  },
});
