import { num, readCsv, text } from '../../lib/csv.ts';

export interface Ks4Year {
  cohort: number | null;
  att8: number | null;
  engMaths5: number | null;
  ebaccEntry: number | null;
  p8: number | null;
  p8Lower: number | null;
  p8Upper: number | null;
  att8Disadvantaged: number | null;
  disadvantagedPct: number | null;
}

export interface Ks4School {
  urn: number;
  /** DfE establishment type group, e.g. "Converter academies", "Independent special schools". */
  typeGroup: string;
  /** Keyed by academic year label, e.g. "2024/25". */
  years: Map<string, Ks4Year>;
}

/** "202425" → "2024/25" */
export const yearLabel = (timePeriod: string) => `${timePeriod.slice(0, 4)}/${timePeriod.slice(4)}`;

const emptyYear = (): Ks4Year => ({
  cohort: null,
  att8: null,
  engMaths5: null,
  ebaccEntry: null,
  p8: null,
  p8Lower: null,
  p8Upper: null,
  att8Disadvantaged: null,
  disadvantagedPct: null,
});

/**
 * Reads the KS4 institution-level file. It has one row per school, year and pupil
 * breakdown; only the "Total" and "Disadvantaged" breakdowns are used.
 */
export async function loadKs4(file: string): Promise<Map<number, Ks4School>> {
  const schools = new Map<number, Ks4School>();

  for await (const row of readCsv(file)) {
    const breakdown = row.breakdown;
    if (breakdown !== 'Total' && breakdown !== 'Disadvantaged') continue;

    const urn = num(row.school_urn);
    if (urn === null) continue;

    let school = schools.get(urn);
    if (!school) {
      school = { urn, typeGroup: text(row.establishment_type_group) ?? '', years: new Map() };
      schools.set(urn, school);
    }

    const label = yearLabel(row.time_period);
    let year = school.years.get(label);
    if (!year) {
      year = emptyYear();
      school.years.set(label, year);
    }

    if (breakdown === 'Total') {
      year.cohort = num(row.pupil_count);
      year.att8 = num(row.attainment8_average);
      year.engMaths5 = num(row.engmath_95_percent);
      year.ebaccEntry = num(row.ebacc_entering_percent);
      year.p8 = num(row.progress8_average);
      year.p8Lower = num(row.progress8_lower_95_ci);
      year.p8Upper = num(row.progress8_upper_95_ci);
    } else {
      year.att8Disadvantaged = num(row.attainment8_average);
      year.disadvantagedPct = num(row.pupil_percent);
    }
  }

  return schools;
}
