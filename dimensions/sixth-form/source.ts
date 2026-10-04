import { eesCsvUrl } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

export const sources: SourceDef[] = [
  {
    id: 'ks5',
    describe: 'DfE A level and other 16 to 18 results, schools and colleges',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/a-level-and-other-16-to-18-results',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (final results are published each January or February; a revised-results release follows in the autumn)',
    usedFor: 'Sixth form results: average A level grade, best three A levels, AAB share, value added and retention',
    notes:
      'Four years in one file (about 59 MB), and every exam cohort and disadvantage group; only the latest year and the all-students A level rows are used. ' +
      'Suppressed values are `c`, not applicable `z`.',
    // "Schools and colleges - performance" in the publication "A level and other 16 to 18 results". The data-set id stays
    // the same as new years are added. If a release ever starts a new one, find it with
    // `latestDataSetId('3f3a66ec-5777-42ee-b427-8102a14ce0c5', (t) => t === 'Schools and colleges - performance')`
    // (lib/ees.ts), or in the data catalogue (filter Geographic level = School), and replace the id.
    resolve: async () => eesCsvUrl('eb2322e3-5976-42f2-ae83-900f26e92bd9'),
  },
];
