import { num, readCsvShared } from '../../lib/csv.ts';
import { yearLabel } from '../ks4-headline/parse.ts';

export interface PassRates {
  /** English and maths both at grade 4+ (%). */
  engMaths4: number | null;
  /** 5+ GCSE passes at grade 4+ including English and maths (%). */
  fiveGcseEngMaths: number | null;
  /** Achieving the EBacc at grade 4+ / 5+ (% of the year group). */
  ebacc4: number | null;
  ebacc5: number | null;
}

/** Keyed by academic year label ("2024/25"). */
export type PassRatesSchool = Map<string, PassRates>;

/** Reads the "Total" rows of the KS4 institution-level file. */
export async function loadPassRates(file: string): Promise<Map<number, PassRatesSchool>> {
  const schools = new Map<number, PassRatesSchool>();

  for await (const row of readCsvShared(file)) {
    if (row.breakdown !== 'Total') continue;
    const urn = num(row.school_urn);
    if (urn === null) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = new Map()));
    school.set(yearLabel(row.time_period), {
      engMaths4: num(row.engmath_94_percent),
      fiveGcseEngMaths: num(row.gcse_five_engmath_percent),
      ebacc4: num(row.ebacc_94_percent),
      ebacc5: num(row.ebacc_95_percent),
    });
  }

  return schools;
}
