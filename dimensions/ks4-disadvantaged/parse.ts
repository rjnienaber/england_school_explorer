import { num, readCsvShared } from '../../lib/csv.ts';
import { yearLabel } from '../ks4-headline/parse.ts';

export interface DisadvantageYear {
  /** Pupils eligible for free school meals in the last 6 years, or looked after (DfE "disadvantaged"). */
  disadvantagedCount: number | null;
  disadvantagedAtt8: number | null;
  notDisadvantagedCount: number | null;
  notDisadvantagedAtt8: number | null;
}

/** Keyed by academic year label ("2024/25"). */
export type DisadvantageSchool = Map<string, DisadvantageYear>;

/**
 * Reads the "Disadvantaged" and "Not known to be disadvantaged" rows of the KS4 institution-level
 * file (one row per school, year and pupil group).
 */
export async function loadDisadvantage(file: string): Promise<Map<number, DisadvantageSchool>> {
  const schools = new Map<number, DisadvantageSchool>();

  for await (const row of readCsvShared(file)) {
    const disadvantaged = row.breakdown === 'Disadvantaged';
    if (!disadvantaged && row.breakdown !== 'Not known to be disadvantaged') continue;
    const urn = num(row.school_urn);
    if (urn === null) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = new Map()));
    const label = yearLabel(row.time_period);
    let year = school.get(label);
    if (!year) {
      school.set(label, (year = { disadvantagedCount: null, disadvantagedAtt8: null, notDisadvantagedCount: null, notDisadvantagedAtt8: null }));
    }

    if (disadvantaged) {
      year.disadvantagedCount = num(row.pupil_count);
      year.disadvantagedAtt8 = num(row.attainment8_average);
    } else {
      year.notDisadvantagedCount = num(row.pupil_count);
      year.notDisadvantagedAtt8 = num(row.attainment8_average);
    }
  }

  return schools;
}
