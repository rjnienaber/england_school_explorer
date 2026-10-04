import { downloadEesQuery } from '../../lib/ees.ts';
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
      'Four years in one file (about 59 MB), and every exam cohort and disadvantage group; only the latest year and the all-students A level rows are used, ' +
      'so only those rows and the columns read are fetched through the DfE statistics API (well under 1 MB). ' +
      'Suppressed values are `c`, not applicable `z`.',
    // "Schools and colleges - performance" in the publication "A level and other 16 to 18 results" (the catalogue file
    // eb2322e3-5976-42f2-ae83-900f26e92bd9). The API data-set id stays the same as new years are added (the query uses the
    // latest version). If it ever changes, find it with
    // `curl https://api.education.gov.uk/statistics/v1/publications/3f3a66ec-5777-42ee-b427-8102a14ce0c5/data-sets?pageSize=20`
    // (the data set titled "Schools and colleges - performance", geographic level School) and replace the id.
    fetchTo: async (file) => {
      await downloadEesQuery(
        {
          dataSetId: '019c2960-81e3-70c2-8d65-72c3718ae4fd',
          filters: { exam_cohort: ['A level'], disadvantage_status: ['Total'] },
          indicators: [
            'aps_per_entry_student_count',
            'aps_per_entry',
            'aps_per_entry_grade',
            'best_three_alevels_aps',
            'best_three_alevels_grade',
            'aab_percent',
            'value_added',
            'value_added_lower_ci',
            'value_added_upper_ci',
            'progress_banding',
            'retained_percent',
          ],
        },
        file,
      );
      return 'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/eb2322e3-5976-42f2-ae83-900f26e92bd9/csv';
    },
  },
];
