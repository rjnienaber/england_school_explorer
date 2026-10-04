import { downloadEesQuery } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

export const sources: SourceDef[] = [
  {
    id: 'census',
    describe: 'DfE Schools, pupils and their characteristics (January school census), school level',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/school-pupils-and-their-characteristics',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (January census, published in June)',
    usedFor: 'Pupils on roll, free school meals eligibility and pupils with English as an additional language, whole school (the latter also feeds the expected score in Results vs intake)',
    notes:
      'The full file is 2.8 GB (every school of every phase, with ethnicity, age and year-group breakdowns), so only the rows used are fetched through the DfE statistics API (about 1 MB): ' +
      'state-funded secondary and independent schools, whole-school totals. The latest census only. Percentages are suppressed (`x`) where numbers are very small. ' +
      'There is no school-level SEN data in the open DfE statistics (the Special educational needs in England data sets stop at local authority level), so SEN is not shown.',
    // "School level" in Schools, pupils and their characteristics. The API data-set id stays the same from census to census
    // (the query uses the latest version), unlike the catalogue file id, which changes with each release. If it ever
    // does change, find it with `curl https://api.education.gov.uk/statistics/v1/publications/a91d9e05-be82-474c-85ae-4913158406d0/data-sets`
    // (the data set titled "School level").
    fetchTo: async (file) => {
      await downloadEesQuery(
        {
          dataSetId: '019e7403-4523-7749-b530-159f451dd83c',
          filters: {
            phase_type_grouping: ['State-funded secondary', 'Independent school'],
            sex: ['Total'],
            attendance_pattern: ['Total'],
            breakdown: ['Total', 'FSM eligible', 'First language other than English'],
          },
          indicators: ['breakdown_topic', 'pupil_count', 'pupil_percent'],
        },
        file,
      );
      return 'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/7e8c04bd-24eb-49ca-b403-76e829ac3b9e';
    },
  },
];
