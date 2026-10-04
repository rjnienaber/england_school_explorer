// The "standard pass" (grade 4+) measures and the old "5 GCSEs including English and maths"
// headline, from the same year as the headline GCSE results. Reads the KS4 file owned by ks4-headline.

import { defineDimension } from '../../lib/dimension.ts';
import { loadPassRates } from './parse.ts';

export const module = defineDimension({
  id: 'ks4-pass-rates',
  title: 'GCSE pass rates at grade 4+ (KS4)',
  dependsOn: ['gias-core', 'ks4-headline'],
  fields: {
    passRatesYear: {
      type: 'string',
      placement: 'detail',
      label: 'GCSE pass rates year',
      description: 'Same year as the headline GCSE results',
      source: 'ks4',
    },
    engMaths4: {
      type: 'number',
      placement: 'detail',
      label: 'English and maths grade 4+ (%)',
      description: 'Share of the year group with a standard pass (grade 4 or above) in both English and maths',
      source: 'ks4',
      year: 'passRatesYear',
      unit: '%',
    },
    fiveGcseEngMaths: {
      type: 'number',
      placement: 'detail',
      label: '5+ GCSEs at grade 4+ including English and maths (%)',
      description: 'Share of the year group with five or more GCSE passes at grade 4 or above, English and maths among them (DfE: "5+ level 2 passes including English and maths")',
      source: 'ks4',
      year: 'passRatesYear',
      unit: '%',
    },
    ebacc4: {
      type: 'number',
      placement: 'detail',
      label: 'EBacc at grade 4+ (%)',
      description: 'Share of the year group achieving the English Baccalaureate at a standard pass (grade 4+). Counts the whole year group, not just those entering',
      source: 'ks4',
      year: 'passRatesYear',
      unit: '%',
    },
    ebacc5: {
      type: 'number',
      placement: 'detail',
      label: 'EBacc at grade 5+ (%)',
      description: 'Share of the year group achieving the English Baccalaureate at a strong pass (grade 5+). Counts the whole year group, not just those entering',
      source: 'ks4',
      year: 'passRatesYear',
      unit: '%',
    },
  },

  async build(ctx) {
    const byUrn = await loadPassRates(ctx.dataPath('ks4'));
    const headline = ctx.read('ks4-headline');

    const rows = [];
    for (const { urn } of ctx.schools.all) {
      const label = headline.get(urn)?.ks4Year;
      if (typeof label !== 'string') continue;
      const y = byUrn.get(urn)?.get(label);
      if (!y || (y.engMaths4 === null && y.fiveGcseEngMaths === null && y.ebacc4 === null && y.ebacc5 === null)) continue;
      rows.push({ urn, passRatesYear: label, ...y });
    }

    ctx.log(`${rows.length} schools with grade 4+ pass rates`);
    return rows;
  },
});
