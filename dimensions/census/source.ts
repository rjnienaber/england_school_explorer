import { eesCsvUrl } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

export const sources: SourceDef[] = [
  {
    id: 'census',
    describe: 'DfE Schools, pupils and their characteristics (January school census), school level',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/school-pupils-and-their-characteristics',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (January census, published in June)',
    usedFor: 'Pupils on roll, free school meals eligibility and pupils with English as an additional language, whole school',
    notes:
      'Very large file (about 2.8 GB, every school of every phase with ethnicity, age and year-group breakdowns), so it is streamed and only the rows used are kept. ' +
      'The latest census only. Percentages are suppressed (`x`) where numbers are very small. ' +
      'There is no school-level SEN data in the open DfE statistics (the Special educational needs in England data sets stop at local authority level), so SEN is not shown.',
    // "School level" in Schools, pupils and their characteristics. Each release (January census, published in June) gets a
    // new data-set id. To find the newest, open the publication's data catalogue (filter Geographic level = School),
    // or call latestDataSetId('a91d9e05-be82-474c-85ae-4913158406d0', (t) => t.trim() === 'School level') from lib/ees.ts,
    // and replace the id here. The 2025/26 file is 7e8c04bd-24eb-49ca-b403-76e829ac3b9e.
    resolve: async () => eesCsvUrl('7e8c04bd-24eb-49ca-b403-76e829ac3b9e'),
  },
];
