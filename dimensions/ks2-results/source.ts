import { downloadEesQuery } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

const PAGE = 'https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-2-attainment';
const CATALOGUE = 'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set';

/** The "Reading, writing and maths" combined subject, and the three subjects behind it. */
export const RWM = 'Reading, writing and maths';
const MEASURES = ['expected_standard_pupil_percent', 'higher_standard_pupil_percent'];
const PROGRESS = ['progress_measure_score', 'progress_measure_lower_conf_interval', 'progress_measure_upper_conf_interval'];

/**
 * The columns ks2-results/parse.ts reads from the performance file (a test checks the parser and the fixture against this list).
 * Add a column here when the parser starts reading one.
 */
export const KS2_COLUMNS = ['time_period', 'school_urn', 'breakdown', 'subject', ...MEASURES, 'average_scaled_score', ...PROGRESS];
export const KS2_INFO_COLUMNS = ['time_period', 'school_urn', 'telig', 'telig_23', 'telig_3yr'];

export const sources: SourceDef[] = [
  {
    id: 'ks2',
    describe: 'DfE key stage 2 attainment, institution-level performance data set (schools)',
    homepage: PAGE,
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (provisional in July, revised in December)',
    usedFor: 'Share of pupils reaching the expected and higher standard in reading, writing and maths, average scaled scores, progress scores with confidence intervals, and the three-year average',
    notes:
      'Three years per file (currently 2022/23 to 2024/25); all three are kept. The catalogue file lists every pupil group and subject, so only the rows and columns used are fetched through the DfE ' +
      'statistics API: the whole-school total for reading, writing, maths and the three combined, plus the published three-year average (about 10 MB, 213,000 rows). ' +
      'Progress scores exist only for 2022/23: later pupils have no key stage 1 results to measure from, because the tests were cancelled in COVID. `z` and `c` mark missing or suppressed values.',
    // "Key stage 2 institutional level - Schools (performance)" in Key stage 2 attainment (catalogue file f6cb50e9-0eca-4b1e-ac1a-6f6bb9d21a07), 2022/23
    // onwards. The API data-set id stays the same as years are added (the query uses the latest version). If it ever changes, find the
    // new one with `curl https://api.education.gov.uk/statistics/v1/publications/8b7474f9-5870-4ecc-7557-08da5f64dcf1/data-sets?pageSize=40`
    // (the title above; the `id` is the API id, the `latestVersion.file.id` the catalogue one).
    fetchTo: async (file) => {
      await downloadEesQuery(
        {
          dataSetId: '019afee4-e5d0-72f9-9a8f-d7a1a56eac1d',
          periods: 'all',
          filters: { breakdown: ['Total'], subject: [RWM] },
          indicators: MEASURES,
          also: [
            // The published average of the last three years: steadier for a school with few pupils
            { filters: { breakdown: ['3 year average'], subject: [RWM] }, indicators: MEASURES },
            // Reading and maths have a scaled score, writing is teacher-assessed (no score)
            { filters: { breakdown: ['Total'], subject: ['Reading', 'Maths'] }, indicators: [...MEASURES, 'average_scaled_score', ...PROGRESS] },
            { filters: { breakdown: ['Total'], subject: ['Writing'] }, indicators: [...MEASURES, ...PROGRESS] },
          ],
        },
        file,
      );
      return `${CATALOGUE}/f6cb50e9-0eca-4b1e-ac1a-6f6bb9d21a07`;
    },
  },
  {
    id: 'ks2-info',
    describe: 'DfE key stage 2 attainment, institution-level school information data set',
    homepage: PAGE,
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (with the KS2 results)',
    usedFor: 'Number of pupils who took the tests (the cohort), for this and the two years before',
    notes:
      'One row per school for the latest year, with the cohort for that year (`telig`), the year before (`telig_23`) and the total for three years (`telig_3yr`), ' +
      'so the earliest year is the total less the other two. Fetched through the DfE statistics API (0.4 MB). `z` marks a missing value.',
    // "Key stage 2 institution level - Schools (School information)" (catalogue file 3166c43a-c37e-4087-a0ec-4ed703f7a0b2), found the same way as the ks2 source above.
    fetchTo: async (file) => {
      await downloadEesQuery({ dataSetId: '019afee4-ba17-73cb-85e0-f88c101bb734', filters: {}, indicators: ['telig', 'telig_23', 'telig_3yr'] }, file);
      return `${CATALOGUE}/3166c43a-c37e-4087-a0ec-4ed703f7a0b2`;
    },
  },
];
