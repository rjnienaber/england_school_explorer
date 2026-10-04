import type { SourceDef } from '../../lib/dimension.ts';
import { downloadFilteredCsv } from '../../lib/filter-csv.ts';

// The columns `parse.ts` reads (the file has about 100)
const COLUMNS = [
  'LSOA code (2021)',
  'Income Deprivation Affecting Children Index (IDACI) Score (rate)',
  'Income Deprivation Affecting Children Index (IDACI) Decile (where 1 is most deprived 10% of LSOAs)',
];

// "File 7" of the English Indices of Deprivation 2025 (published 30 October 2025): every domain's score,
// rank and decile for each of the 33,755 LSOAs (2021 boundaries) in one CSV. The asset URL is fixed
// (these statistics are not updated; a new edition is a new release), so the download is deterministic.
const FILE_7 =
  'https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv';

export const sources: SourceDef[] = [
  {
    id: 'iod2025',
    describe: 'English Indices of Deprivation 2025: all ranks, scores and deciles for each small area (LSOA)',
    homepage: 'https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025',
    publisher: 'Ministry of Housing, Communities and Local Government',
    licence: 'OGL v3',
    updated: 'every few years (previous edition 2019)',
    usedFor: 'Area deprivation (income deprivation affecting children, IDACI) of the neighbourhood each school is in',
    notes:
      'About 10 MB, of which three columns are kept. Joined to schools through the LSOA (2021) code in the school register. England only.',
    fetchTo: async (file) => {
      await downloadFilteredCsv(FILE_7, file, { columns: COLUMNS });
      return FILE_7;
    },
  },
];
