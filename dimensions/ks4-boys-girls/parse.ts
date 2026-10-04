import { num, readCsv } from '../../lib/csv.ts';
import { yearLabel } from '../ks4-headline/parse.ts';

export type Sex = 'Boys' | 'Girls';

export interface SexResults {
  att8: number | null;
  count: number | null;
}

/** Keyed by academic year label ("2024/25"), then by sex. */
export type SexSchool = Map<string, Partial<Record<Sex, SexResults>>>;

/** Reads the Boys and Girls rows (breakdown topic "Sex") of the KS4 institution-level file. */
export async function loadSexResults(file: string): Promise<Map<number, SexSchool>> {
  const schools = new Map<number, SexSchool>();

  for await (const row of readCsv(file)) {
    if (row.breakdown !== 'Boys' && row.breakdown !== 'Girls') continue;
    const urn = num(row.school_urn);
    if (urn === null) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = new Map()));
    const label = yearLabel(row.time_period);
    let year = school.get(label);
    if (!year) school.set(label, (year = {}));
    year[row.breakdown] = { att8: num(row.attainment8_average), count: num(row.pupil_count) };
  }

  return schools;
}
