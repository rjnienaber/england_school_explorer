import { eesCsvUrl } from '../../lib/ees.ts';
import { downloadFilteredCsv } from '../../lib/filter-csv.ts';
import { num, text } from '../../lib/csv.ts';
import type { SourceDef } from '../../lib/dimension.ts';

export const sources: SourceDef[] = [
  {
    id: 'destinations',
    describe: 'DfE key stage 4 destination measures, institution level',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-destination-measures',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (about two years behind: leavers of year X are published around October of X+2)',
    usedFor: 'Where Year 11 leavers went next: school sixth form, sixth form college, FE college, apprenticeship, work',
    notes:
      'Several leaver years in one file (about 38 MB), currently 2020/21 to 2022/23; only the latest is used, and only the all-pupils rows (the download is filtered to those as it arrives). ' +
      'Small cohorts are suppressed (`c`).',
    // "Key stage 4 leavers institution level destinations". The data-set id stays the same as new years are added.
    // If a release ever starts a new one, look it up in the data catalogue (filter Geographic level = School)
    // under "Key stage 4 destination measures" and replace the id.
    fetchTo: async (file) => {
      const url = await eesCsvUrl('7be58881-d49f-4e3b-b2b6-0877a1a0fe6e');
      await downloadFilteredCsv(url, file, {
        columns: ['time_period', 'school_urn', 'breakdown_topic', 'data_type', 'institution_group', 'cohort', 'overall', 'ssf', 'sfc', 'fe', 'appren', 'all_work', 'all_notsust'],
        keep: (r) => r.breakdown_topic === 'Total' && r.data_type === 'Percentage' && text(r.institution_group) === 'State-funded mainstream schools' && !!num(r.cohort),
        latestPeriod: 'any',
      });
      return url;
    },
  },
];
