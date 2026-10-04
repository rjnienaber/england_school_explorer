import { downloadEesQuery } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

export const sources: SourceDef[] = [
  {
    id: 'ks4-subjects',
    describe: 'DfE key stage 4 performance, subject entries at school level',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (provisional in autumn, revised in spring)',
    usedFor: 'Which GCSE subjects each school entered pupils for (languages, computer science, separate sciences, music, art, drama, statistics, further maths) and how many pupils',
    notes:
      'The full file lists every grade of every qualification for every school (hundreds of MB), so only the total GCSE entries per school and subject are fetched through the DfE statistics API, latest year only. ' +
      'Entries are divided by pupils at the end of key stage 4, so a share can exceed 100% and is capped. `z`, `c` and `x` mark suppressed values.',
    // "Subject school level exam data" in Key stage 4 performance (the catalogue file 49abed18-1c61-489f-afc0-11f501335da1). The API
    // data-set id stays the same as years are added (the query uses the latest version). If it ever changes, find it with
    // `curl https://api.education.gov.uk/statistics/v1/publications/c8756008-ed50-4632-9b96-01b5ca002a43/data-sets?pageSize=20`.
    fetchTo: async (file) => {
      await downloadEesQuery(
        {
          dataSetId: '1ae39901-b462-df76-b108-640a078d7944',
          hide: ['grade'],
          filters: {
            grade: ['Total exam entries'],
            qualification_detailed: ['GCSE (9-1) Full Course', 'GCSE (9-1) Full Course (Double Award)'],
            subject: true,
            subject_discount_group: true,
          },
          indicators: ['number_achieving', 'pupil_count'],
          // There is no GCSE in further maths; the nearest entry is the Level 3 free-standing "additional maths" qualification
          also: [{ filters: { grade: ['Total exam entries'], subject_discount_group: ['Additional Maths (FSMQ)'] }, indicators: ['number_achieving', 'pupil_count'] }],
        },
        file,
      );
      return 'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/49abed18-1c61-489f-afc0-11f501335da1/csv';
    },
  },
];
