import { num, readCsvShared } from '../../lib/csv.ts';
import { yearLabel } from '../ks4-headline/parse.ts';

export interface CoreSubjects {
  /** Average English grade (1-9 scale), or null. */
  englishGrade: number | null;
  /** Average maths grade (1-9 scale), or null. */
  mathsGrade: number | null;
}

/** Keyed by academic year label ("2024/25"). */
export type CoreSubjectsSchool = Map<string, CoreSubjects>;

/**
 * English and maths each fill two of the ten Attainment 8 slots (they are double-weighted), so the
 * published figure is points over two slots. Dividing by 2 gives an average grade. (Checked against the
 * data: English + maths + EBacc + open points add up to Attainment 8, and halved they average about 4.4
 * and 4.2 for state schools.) A figure of exactly 0 means no counted results (typically IGCSEs, which
 * don't count towards Attainment 8), not a school where everyone failed, so it is treated as missing.
 */
export function pointsToGrade(points: number | null): number | null {
  return points === null || points <= 0 ? null : points / 2;
}

/** Reads the "Total" rows of the KS4 institution-level file. */
export async function loadCoreSubjects(file: string): Promise<Map<number, CoreSubjectsSchool>> {
  const schools = new Map<number, CoreSubjectsSchool>();

  for await (const row of readCsvShared(file)) {
    if (row.breakdown !== 'Total') continue;
    const urn = num(row.school_urn);
    if (urn === null) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = new Map()));
    school.set(yearLabel(row.time_period), {
      englishGrade: pointsToGrade(num(row.attainment8eng_average)),
      mathsGrade: pointsToGrade(num(row.attainment8mat_average)),
    });
  }

  return schools;
}
