import { downloadEesQuery } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

/**
 * The indicator columns the ks4-* modules read, all of them together (each parse.ts reads its own few; the file is shared).
 * Add a column here when a module starts reading one: a test (test.ts) fails if one is missing. Changing this file also
 * changes the CI data cache key, so the next run fetches again.
 */
export const KS4_INDICATORS = [
  'pupil_count',
  'pupil_percent',
  'attainment8_average',
  'attainment8eng_average',
  'attainment8mat_average',
  'engmath_94_percent',
  'engmath_95_percent',
  'gcse_five_engmath_percent',
  'ebacc_94_percent',
  'ebacc_95_percent',
  'ebacc_entering_percent',
  'ebacchum_entering_percent',
  'ebacclan_entering_percent',
  'lan_multiple_entering_percent',
  'sci_triple_entering_percent',
  'gcse_entries_average',
  'progress8_average',
  'progress8_lower_95_ci',
  'progress8_upper_95_ci',
  'progress8eng_average',
  'progress8eng_lower_95_ci',
  'progress8eng_upper_95_ci',
  'progress8mat_average',
  'progress8mat_lower_95_ci',
  'progress8mat_upper_95_ci',
  'progress8ebacc_average',
  'progress8ebacc_lower_95_ci',
  'progress8ebacc_upper_95_ci',
  'progress8open_average',
  'progress8open_lower_95_ci',
  'progress8open_upper_95_ci',
  'valueaddedsci_average',
  'valueaddedsci_lower_95_ci',
  'valueaddedsci_upper_95_ci',
  'valueaddedsci_pupil_count',
  'valueaddedhum_average',
  'valueaddedhum_lower_95_ci',
  'valueaddedhum_upper_95_ci',
  'valueaddedhum_pupil_count',
  'valueaddedlan_average',
  'valueaddedlan_lower_95_ci',
  'valueaddedlan_upper_95_ci',
  'valueaddedlan_pupil_count',
];

/** The pupil-group filters of the KS4 data set. The catalogue CSV has one row per school, year and group, with these all "Total" except one. */
const GROUP_FILTERS = ['sex', 'disadvantage_status', 'first_language', 'prior_attainment'];

/** What the pupil-group rows are read for (ks4-headline, -boys-girls, -disadvantaged, -eal, -prior-attainment): the rest of the columns stay empty there. */
const GROUP_INDICATORS = ['pupil_count', 'pupil_percent', 'attainment8_average', 'progress8_average', 'progress8_lower_95_ci', 'progress8_upper_95_ci'];

export const sources: SourceDef[] = [
  {
    id: 'ks4',
    describe: 'DfE key stage 4 performance, institution-level data set',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (provisional in autumn, revised in spring)',
    usedFor: 'Attainment 8, Progress 8 with confidence intervals, English and maths grade 5+ and 4+, average English and maths grades, Progress 8 by subject area, value added in science, humanities and languages, EBacc entry, cohort size, % disadvantaged',
    notes:
      'Three years per file (currently 2022/23 to 2024/25); all three are kept. The catalogue file is 96 MB (156 columns, a row for every pupil group), so only the rows and columns the modules read are fetched ' +
      'through the DfE statistics API (a few MB): the whole-school total plus the sex, disadvantage, first-language and prior-attainment groups. ' +
      'The API has no establishment type group (the catalogue CSV has), so the register (GIAS) decides which schools are special. `z` and `c` mark missing or suppressed values. ' +
      'The older compare-school-performance download blocks scripted access.',
    // "Performance tables schools data" in Key stage 4 performance (the catalogue file 5b3d308c-da72-467f-b2ef-ab77d576a455), 2022/23
    // onwards. The API data-set id stays the same as new years are added (the query uses the latest version). If it ever
    // changes, find it with `curl https://api.education.gov.uk/statistics/v1/publications/c8756008-ed50-4632-9b96-01b5ca002a43/data-sets?pageSize=20`.
    fetchTo: async (file) => {
      await downloadEesQuery(
        {
          dataSetId: '19e39901-a96c-be76-b9c2-6af54ae076d2',
          periods: 'all',
          hide: [...GROUP_FILTERS, 'mobility'],
          // The school totals, with every column. ("Non mobile" pupils are a group nobody reads.)
          filters: { sex: ['Total'], disadvantage_status: ['Total'], first_language: ['Total'], prior_attainment: ['Total'], mobility: ['Total'] },
          indicators: KS4_INDICATORS,
          // Each pupil group, with only the columns the group rows are read for. A row has one group that is not Total.
          also: [
            { filters: { sex: ['Boys', 'Girls'] }, indicators: GROUP_INDICATORS },
            { filters: { disadvantage_status: ['Disadvantaged', 'Not known to be disadvantaged'] }, indicators: GROUP_INDICATORS },
            { filters: { first_language: ['Known or believed to be other than English'] }, indicators: GROUP_INDICATORS },
            { filters: { prior_attainment: ['High prior attainment', 'Mid prior attainment', 'Low prior attainment'] }, indicators: GROUP_INDICATORS },
          ],
          // The catalogue CSV's `breakdown` column, which the modules filter on
          derive: { breakdown: (v) => GROUP_FILTERS.map((c) => v[c]).find((label) => label !== 'Total') ?? 'Total' },
        },
        file,
      );
      return 'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/5b3d308c-da72-467f-b2ef-ab77d576a455/csv';
    },
  },
];
