import { num, readCsvShared } from '../../lib/csv.ts';
import { yearLabel } from '../ks4-headline/parse.ts';
import { P8_COLUMNS, P8_ELEMENTS, VA_AREAS, VA_COLUMNS, type P8Element, type VaArea } from './areas.ts';

/** A score with its 95% confidence interval. */
export interface Scored {
  average: number | null;
  lower: number | null;
  upper: number | null;
}

export interface SubjectAreas {
  elements: Record<P8Element, Scored>;
  /** Value added also has the number of pupils the figure is based on. */
  valueAdded: Record<VaArea, Scored & { pupils: number | null }>;
}

/** Keyed by academic year label ("2023/24"). */
export type SubjectAreasSchool = Map<string, SubjectAreas>;

const scored = (row: Record<string, string>, prefix: string): Scored => ({
  average: num(row[`${prefix}_average`]),
  lower: num(row[`${prefix}_lower_95_ci`]),
  upper: num(row[`${prefix}_upper_95_ci`]),
});

/**
 * Reads the "Total" rows of the KS4 institution-level file. Only 2022/23 and 2023/24 have these
 * columns filled in: DfE did not publish Progress 8 for later years.
 */
export async function loadSubjectAreas(file: string): Promise<Map<number, SubjectAreasSchool>> {
  const schools = new Map<number, SubjectAreasSchool>();

  for await (const row of readCsvShared(file)) {
    if (row.breakdown !== 'Total') continue;
    const urn = num(row.school_urn);
    if (urn === null) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = new Map()));
    school.set(yearLabel(row.time_period), {
      elements: Object.fromEntries(P8_ELEMENTS.map((e) => [e, scored(row, P8_COLUMNS[e])])) as Record<P8Element, Scored>,
      valueAdded: Object.fromEntries(
        VA_AREAS.map((a) => [a, { ...scored(row, VA_COLUMNS[a]), pupils: num(row[`${VA_COLUMNS[a]}_pupil_count`]) }]),
      ) as SubjectAreas['valueAdded'],
    });
  }

  return schools;
}
