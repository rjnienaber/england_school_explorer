import { num, readCsv } from '../../lib/csv.ts';
import { yearLabel } from '../ks4-headline/parse.ts';

export interface EalResults {
  count: number | null;
  /** Share of the year group, 0-100. */
  percent: number | null;
  att8: number | null;
}

/** Keyed by academic year label ("2024/25"). */
export type EalSchool = Map<string, EalResults>;

/**
 * Reads the "First language: known or believed to be other than English" rows of the KS4
 * institution-level file. There is no "English" row, so the comparison is the school total.
 */
export async function loadEal(file: string): Promise<Map<number, EalSchool>> {
  const schools = new Map<number, EalSchool>();

  for await (const row of readCsv(file)) {
    if (row.breakdown !== 'Known or believed to be other than English') continue;
    const urn = num(row.school_urn);
    if (urn === null) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = new Map()));
    school.set(yearLabel(row.time_period), {
      count: num(row.pupil_count),
      percent: num(row.pupil_percent),
      att8: num(row.attainment8_average),
    });
  }

  return schools;
}
