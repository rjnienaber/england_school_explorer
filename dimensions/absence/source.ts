import { eesCsvUrl } from '../../lib/ees.ts';
import { downloadFilteredCsv } from '../../lib/filter-csv.ts';
import { text } from '../../lib/csv.ts';
import type { SourceDef } from '../../lib/dimension.ts';

export const sources: SourceDef[] = [
  {
    id: 'absence',
    describe: 'DfE pupil absence in schools in England, absence rates by school',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/pupil-absence-in-schools-in-england',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (full academic year, published in the spring)',
    usedFor: 'Overall, unauthorised, persistent (10%+ of sessions) and severe (50%+) absence rates, with pupil numbers',
    notes:
      'All academic years since 2013/14 in one file (about 120 MB), currently to 2024/25; only the latest year is used. ' +
      'The download is filtered as it arrives: only the latest year, State-funded secondary rows and the columns read are stored. ' +
      'State-funded schools only. Missing values are suppressed (`x`).',
    // "Absence rates by school level". The data-set id stays the same as new years are added (2024/25 is in it). If a
    // release ever starts a new one, look it up in the data catalogue (filter Geographic level = School) under
    // "Pupil absence in schools in England" and replace the id.
    // The API has no school-level data set for this release, so the catalogue CSV is streamed and filtered.
    // The file is not ordered newest year first, so all of it is read.
    fetchTo: async (file) => {
      const url = await eesCsvUrl('889f9166-e3bf-4d3a-afb2-d86e4aecc70a');
      await downloadFilteredCsv(url, file, {
        columns: ['time_period', 'school_urn', 'education_phase', 'enrolments', 'sess_overall_percent', 'sess_unauthorised_percent', 'enrolments_pa_10_exact_percent', 'enrolments_pa_50_exact_percent'],
        keep: (r) => text(r.education_phase) === 'State-funded secondary',
        latestPeriod: 'any',
      });
      return url;
    },
  },
];
