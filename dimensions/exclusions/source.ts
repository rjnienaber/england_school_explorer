import { eesCsvUrl } from '../../lib/ees.ts';
import { downloadFilteredCsv } from '../../lib/filter-csv.ts';
import { num, text } from '../../lib/csv.ts';
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
      'The download is filtered as it arrives and stopped once the latest year has been read (the file lists the newest year first). ' +
      'State-funded schools only. Rates are suppressed (`x`) for schools with no pupils on roll.',
    // "Suspensions and permanent exclusions - school level". The data-set id stays the same as new years are added
    // (2006/07 to 2024/25 are all in it). If a release ever starts a new one, look it up in the data catalogue
    // (filter Geographic level = School) under "Suspensions and permanent exclusions in England" and replace the id.
    // Newest year first, so the transfer is stopped when the second year starts (a fraction of the file is downloaded).
    fetchTo: async (file) => {
      const url = await eesCsvUrl('a4b5a46f-5bed-42b5-91b8-93620a04001e');
      await downloadFilteredCsv(url, file, {
        columns: ['time_period', 'school_urn', 'education_phase', 'headcount', 'susp_rate', 'suspension', 'one_plus_susp_rate', 'perm_excl', 'perm_excl_rate'],
        keep: (r) => ['State-funded secondary', 'State-funded primary'].includes(text(r.education_phase) ?? '') && !!num(r.headcount),
        latestPeriod: 'newest-first',
      });
      return url;
    },
  },
];
