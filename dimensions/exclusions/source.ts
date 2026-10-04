import { eesCsvUrl } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

export const sources: SourceDef[] = [
  {
    id: 'exclusions',
    describe: 'DfE suspensions and permanent exclusions in England, school level',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/suspensions-and-permanent-exclusions-in-england',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (full academic year, published in the summer, a year behind)',
    usedFor: 'Suspension rate, pupils suspended at least once and permanent exclusions, with pupil numbers',
    notes:
      'All academic years since 2006/07 in one file (about 85 MB), currently to 2024/25; only the latest year is used. ' +
      'State-funded schools only. Rates are suppressed (`x`) for schools with no pupils on roll.',
    // "Suspensions and permanent exclusions - school level". The data-set id stays the same as new years are added
    // (2006/07 to 2024/25 are all in it). If a release ever starts a new one, look it up in the data catalogue
    // (filter Geographic level = School) under "Suspensions and permanent exclusions in England" and replace the id.
    resolve: async () => eesCsvUrl('a4b5a46f-5bed-42b5-91b8-93620a04001e'),
  },
];
