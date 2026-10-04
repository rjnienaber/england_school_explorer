import { num, readCsv, readCsvShared, text } from '../../lib/csv.ts';

export interface Idaci {
  /** 1 = the most deprived tenth of England's neighbourhoods, 10 = the least deprived. */
  decile: number;
  /** Share of children (0 to 100) living in income-deprived families, in the neighbourhood. */
  scorePct: number;
}

const CODE = 'LSOA code (2021)';
const SCORE = 'Income Deprivation Affecting Children Index (IDACI) Score (rate)';
const DECILE = 'Income Deprivation Affecting Children Index (IDACI) Decile (where 1 is most deprived 10% of LSOAs)';

/** IDACI by LSOA 2021 code, from IoD 2025 file 7. */
export async function loadIdaci(file: string): Promise<Map<string, Idaci>> {
  const found = new Map<string, Idaci>();
  for await (const row of readCsv(file)) {
    const code = text(row[CODE]);
    const decile = num(row[DECILE]);
    const rate = num(row[SCORE]);
    if (code && decile !== null && rate !== null && decile >= 1 && decile <= 10) found.set(code, { decile, scorePct: Math.round(rate * 1000) / 10 });
  }
  return found;
}

/** Each school's LSOA (2021) code from the school register. Blank for some closed schools. */
export async function loadLsoaCodes(giasFile: string): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  // Shared parse: gias-core reads the same file in the same build
  for await (const row of readCsvShared(giasFile, 'windows-1252')) {
    const urn = num(row.URN);
    const code = text(row['LSOA (code)']);
    if (urn !== null && code) found.set(urn, code);
  }
  return found;
}
