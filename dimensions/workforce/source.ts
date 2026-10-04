import { downloadLatestPeriodCsv, eesCsvUrl } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

const PAGE = 'https://explore-education-statistics.service.gov.uk/find-statistics/school-workforce-in-england';

// Both files are long: every year since 2010 for every school (143 MB and 60 MB) and neither is in the EES query API.
// They list the newest year first, so `downloadLatestPeriodCsv` stops reading after the first year (about 3 MB each
// is transferred and kept). The catalogue ids have stayed the same as years were added; if a release starts new ones,
// find them in the data catalogue (https://explore-education-statistics.service.gov.uk/data-catalogue, publication
// "School workforce in England", Geographic level = School) under "Size of the school workforce - school level" and
// "Teacher sickness absence - school level", and replace the ids.
const SIZE_ID = 'cce5e2fe-b6eb-4741-9199-21afa08fb97a';
const SICKNESS_ID = 'a0e3cf4e-9a1e-4969-9d7d-ecb2de1499f6';

export const sources: SourceDef[] = [
  {
    id: 'workforce',
    describe: 'DfE School workforce in England: size of the school workforce, school level (November census)',
    homepage: PAGE,
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (November census, published in June)',
    usedFor: 'Teachers (full-time equivalent) and teachers without qualified teacher status, for pupil-teacher ratios',
    notes:
      'The full file (143 MB) holds every year since 2010/11; the newest year is first, so only that part is downloaded. ' +
      'Numbers are rounded by the DfE and `x` means suppressed. The publication has no school-level pupil-teacher ratio, so the ratio is our own calculation.',
    fetchTo: async (file) => {
      await downloadLatestPeriodCsv(eesCsvUrl(SIZE_ID), file, [
        'school_urn',
        'school_type',
        'fte_all_teachers',
        'fte_classroom_teachers',
        'fte_all_teachers_without_qts',
        'hc_all_teachers',
        'percent_pt_teacher',
      ]);
      return `https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/${SIZE_ID}`;
    },
  },
  {
    id: 'workforce-sickness',
    describe: 'DfE School workforce in England: teacher sickness absence, school level',
    homepage: PAGE,
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (a year behind the workforce size figures)',
    usedFor: 'Days of sickness absence per teacher, and the share of teachers with any absence',
    notes: 'Full file is 60 MB with every year since 2009/10; only the newest year (currently one year older than the workforce size file) is downloaded.',
    fetchTo: async (file) => {
      await downloadLatestPeriodCsv(eesCsvUrl(SICKNESS_ID), file, [
        'school_urn',
        'total_teachers_taking_absence',
        'percentage_taking_absence',
        'average_number_of_days_all_teachers',
      ]);
      return `https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/${SICKNESS_ID}`;
    },
  },
];
