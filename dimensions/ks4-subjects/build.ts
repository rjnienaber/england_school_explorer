// Which subjects a school enters pupils for at GCSE: languages by name, computer science, the separate sciences, music, art,
// drama and so on, as a share of the year group. Latest year only. Reads its own source (the subject-level KS4 file).

import { defineDimension } from '../../lib/dimension.ts';
import { loadSubjects } from './parse.ts';
import { encodeEntries, FILTER_CODES, LANGUAGE_CODES, SUBJECTS } from './subjects.ts';

export const module = defineDimension({
  id: 'ks4-subjects',
  title: 'GCSE subjects taken (KS4)',
  dependsOn: ['gias-core'],
  fields: {
    subjectsYear: {
      type: 'string',
      placement: 'detail',
      label: 'GCSE subjects year',
      description: 'Academic year of the subject entries',
      source: 'ks4-subjects',
    },
    subjectEntries: {
      type: 'string',
      placement: 'detail',
      label: 'GCSE subject entries (% of year group)',
      description:
        'Headline GCSE subjects (every language the DfE lists, computer science, biology, chemistry, physics, statistics, music, art, drama and others) with the percentage of the year group entered, as "CODE:percent" pairs separated by commas, for example "FRE:45,CS:20". Entries divided by pupils at the end of key stage 4, so a pupil who retakes or takes a subject early can push it up (capped at 100). Subjects with no entries are left out. The further maths code (FM) is the Level 3 free-standing maths qualification, as there is no GCSE in further maths',
      source: 'ks4-subjects',
      year: 'subjectsYear',
    },
    subjectsOffered: {
      type: 'string',
      // The "Offers GCSE" filter reads it
      placement: 'mode',
      label: 'GCSE subjects offered (filter codes)',
      description:
        'Codes of the subjects the "Offers GCSE" filter can pick that the school entered pupils for, separated by commas (LANG means any language). Missing where the school has no subject entries',
      source: 'ks4-subjects',
      year: 'subjectsYear',
    },
  },

  async build(ctx) {
    const all = await loadSubjects(ctx.dataPath('ks4-subjects'));
    const inScope = [...all].filter(([urn]) => ctx.schools.urns.has(urn));

    const rows = inScope.map(([urn, s]) => {
      const offered = FILTER_CODES.filter((c) => s.entries.has(c));
      if (LANGUAGE_CODES.some((c) => s.entries.has(c))) offered.unshift('LANG');
      return { urn, subjectsYear: s.year, subjectEntries: encodeEntries(s.entries), subjectsOffered: offered.join(',') };
    });

    // What a typical state secondary does, for the popup: the median share among schools that enter the subject at all,
    // and the share of schools that enter it
    const stateSchools = inScope.filter(([urn]) => ctx.schools.isState(urn));
    const typical: Record<string, number> = {};
    const offeredBy: Record<string, number> = {};
    for (const { code } of SUBJECTS) {
      const pairs = stateSchools.flatMap(([urn, s]) => (s.entries.has(code) ? [[urn, s.entries.get(code)!] as [number, number]] : []));
      const median = ctx.stats.nationalMedianAmongState(pairs);
      if (median !== null) typical[code] = Math.round(median);
      if (stateSchools.length) offeredBy[code] = Math.round((100 * pairs.length) / stateSchools.length);
    }

    ctx.log(`${rows.length} schools with subject entries for ${inScope[0]?.[1].year ?? 'no year'} (of ${ctx.schools.urns.size} in scope)`);
    return {
      rows,
      metadata: { subjectsYear: inScope[0]?.[1].year ?? null, subjectsTypicalPct: typical, subjectsOfferedByPct: offeredBy },
    };
  },
});
