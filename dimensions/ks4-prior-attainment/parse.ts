import { num, readCsvShared } from '../../lib/csv.ts';
import { yearLabel } from '../ks4-headline/parse.ts';
import { PRIOR_BREAKDOWNS, type PriorGroup } from './groups.ts';

export interface PriorResults {
  /** The group's share of the year group, 0-100. */
  pct: number | null;
  att8: number | null;
  p8: number | null;
  p8Lower: number | null;
  p8Upper: number | null;
}

/** Keyed by academic year label ("2023/24"), then by group. A group missing from the file is absent. */
export type PriorSchool = Map<string, Map<PriorGroup, PriorResults>>;

/**
 * Reads the prior-attainment rows of the KS4 institution-level file (one row per school, year
 * and group). Only years that have KS2-based results appear: 2023/24 is the latest today.
 */
export async function loadPriorAttainment(file: string): Promise<Map<number, PriorSchool>> {
  const schools = new Map<number, PriorSchool>();

  for await (const row of readCsvShared(file)) {
    const group = PRIOR_BREAKDOWNS[row.breakdown];
    const urn = num(row.school_urn);
    if (!group || urn === null) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = new Map()));
    const label = yearLabel(row.time_period);
    let year = school.get(label);
    if (!year) school.set(label, (year = new Map()));

    year.set(group, {
      pct: num(row.pupil_percent),
      att8: num(row.attainment8_average),
      p8: num(row.progress8_average),
      p8Lower: num(row.progress8_lower_95_ci),
      p8Upper: num(row.progress8_upper_95_ci),
    });
  }

  return schools;
}
