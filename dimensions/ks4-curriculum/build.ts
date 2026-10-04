// How broad the curriculum is: triple science, languages, history or geography, and GCSEs per
// pupil, from the same year as the headline GCSE results. Reads the KS4 file owned by ks4-headline.

import { defineDimension } from '../../lib/dimension.ts';
import { loadCurriculum } from './parse.ts';

export const module = defineDimension({
  id: 'ks4-curriculum',
  title: 'Curriculum breadth (KS4)',
  dependsOn: ['gias-core', 'ks4-headline'],
  fields: {
    curriculumYear: {
      type: 'string',
      placement: 'detail',
      label: 'Curriculum year',
      description: 'Same year as the headline GCSE results',
      source: 'ks4',
    },
    tripleSciencePct: {
      type: 'number',
      // The "Most pupils take triple science" filter reads it, so it must load for every school
      placement: 'mode',
      label: 'Entering triple science (%)',
      description: 'Share of the year group entered for triple (separate) science: GCSEs in biology, chemistry and physics. Counts the whole year group',
      source: 'ks4',
      year: 'curriculumYear',
      unit: '%',
    },
    languagePct: {
      type: 'number',
      placement: 'detail',
      label: 'Entering a language GCSE (%)',
      description: 'Share of the year group entered for a GCSE in a language (the language part of the EBacc). Counts the whole year group',
      source: 'ks4',
      year: 'curriculumYear',
      unit: '%',
    },
    multiLanguagePct: {
      type: 'number',
      placement: 'detail',
      label: 'Entering more than one language (%)',
      description: 'Share of the year group entered for GCSEs in more than one language. Counts the whole year group',
      source: 'ks4',
      year: 'curriculumYear',
      unit: '%',
    },
    humanitiesPct: {
      type: 'number',
      placement: 'detail',
      label: 'Entering history or geography (%)',
      description: 'Share of the year group entered for a GCSE in history or geography (the humanities part of the EBacc). Counts the whole year group',
      source: 'ks4',
      year: 'curriculumYear',
      unit: '%',
    },
    gcsesPerPupil: {
      type: 'number',
      placement: 'detail',
      label: 'GCSEs entered per pupil',
      description: 'Average number of GCSE entries per pupil in the year group. Counts GCSE entries only, not other qualifications',
      source: 'ks4',
      year: 'curriculumYear',
      decimals: 1,
    },
  },

  async build(ctx) {
    const byUrn = await loadCurriculum(ctx.dataPath('ks4'));
    const headline = ctx.read('ks4-headline');

    const rows = [];
    for (const { urn } of ctx.schools.all) {
      const label = headline.get(urn)?.ks4Year;
      if (typeof label !== 'string') continue;
      const y = byUrn.get(urn)?.get(label);
      if (!y || Object.values(y).every((v) => v === null)) continue;
      rows.push({ urn, curriculumYear: label, ...y });
    }

    ctx.log(`${rows.length} schools with curriculum figures`);
    return rows;
  },
});
