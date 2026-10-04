import { academicYear } from '../../lib/ees.ts';
import { num, readCsv } from '../../lib/csv.ts';
import { RWM } from './source.ts';

/** The three subjects behind the combined measure. */
export const SUBJECTS = ['Reading', 'Writing', 'Maths'] as const;
export type Subject = (typeof SUBJECTS)[number];

export interface SubjectResult {
  expected: number | null;
  higher: number | null;
  /** Average scaled score (100 = the expected standard). Writing is teacher-assessed and has none. */
  score: number | null;
  progress: number | null;
  progressLower: number | null;
  progressUpper: number | null;
}

export interface Ks2Year {
  /** Reading, writing and maths combined. */
  rwmExpected: number | null;
  rwmHigher: number | null;
  subjects: Record<Subject, SubjectResult>;
  /** Pupils who took the tests; null when the information file has no figure. */
  cohort: number | null;
}

export interface Ks2School {
  /** Keyed by academic year label, e.g. "2024/25". */
  years: Map<string, Ks2Year>;
  /** The published average of the last three years (reading, writing and maths combined), with the label of the last of them. */
  average: { year: string; expected: number | null; higher: number | null } | null;
  /** Pupils who took the tests over the last three years. */
  cohort3yr: number | null;
}

const emptySubject = (): SubjectResult => ({ expected: null, higher: null, score: null, progress: null, progressLower: null, progressUpper: null });
const emptyYear = (): Ks2Year => ({ rwmExpected: null, rwmHigher: null, subjects: { Reading: emptySubject(), Writing: emptySubject(), Maths: emptySubject() }, cohort: null });

/**
 * Reads the KS2 performance file (one row per school, year and subject; the whole-school "Total" rows, and the three-year
 * average for the combined measure) and the school information file for cohort sizes.
 * Every figure goes through `num`, so DfE suppression codes (`z`, `c`, `x`) become null.
 */
export async function loadKs2(file: string, infoFile: string): Promise<Map<number, Ks2School>> {
  const schools = new Map<number, Ks2School>();
  const school = (urn: number) => {
    let s = schools.get(urn);
    if (!s) schools.set(urn, (s = { years: new Map(), average: null, cohort3yr: null }));
    return s;
  };

  for await (const row of readCsv(file)) {
    const urn = num(row.school_urn);
    if (urn === null) continue;
    const label = academicYear(row.time_period);
    const s = school(urn);
    if (row.breakdown === '3 year average') {
      if (row.subject === RWM) s.average = { year: label, expected: num(row.expected_standard_pupil_percent), higher: num(row.higher_standard_pupil_percent) };
      continue;
    }
    if (row.breakdown !== 'Total') continue;
    let year = s.years.get(label);
    if (!year) s.years.set(label, (year = emptyYear()));
    if (row.subject === RWM) {
      year.rwmExpected = num(row.expected_standard_pupil_percent);
      year.rwmHigher = num(row.higher_standard_pupil_percent);
    } else if ((SUBJECTS as readonly string[]).includes(row.subject)) {
      year.subjects[row.subject as Subject] = {
        expected: num(row.expected_standard_pupil_percent),
        higher: num(row.higher_standard_pupil_percent),
        score: num(row.average_scaled_score),
        progress: num(row.progress_measure_score),
        progressLower: num(row.progress_measure_lower_conf_interval),
        progressUpper: num(row.progress_measure_upper_conf_interval),
      };
    }
  }

  // Cohorts: the information file is for the latest year only, with the year before and the three-year total beside it
  for await (const row of readCsv(infoFile)) {
    const urn = num(row.school_urn);
    const s = urn === null ? undefined : schools.get(urn);
    if (!s) continue;
    const latest = academicYear(row.time_period);
    const previous = `${Number(latest.slice(0, 4)) - 1}/${String(Number(latest.slice(0, 4))).slice(2)}`;
    const earliest = `${Number(latest.slice(0, 4)) - 2}/${String(Number(latest.slice(0, 4)) - 1).slice(2)}`;
    const [now, before, total] = [num(row.telig), num(row.telig_23), num(row.telig_3yr)];
    const setCohort = (label: string, value: number | null) => {
      const y = s.years.get(label);
      if (y && value !== null && value >= 0) y.cohort = value;
    };
    setCohort(latest, now);
    setCohort(previous, before);
    // Only when all three are known and add up
    setCohort(earliest, now !== null && before !== null && total !== null ? total - now - before : null);
    s.cohort3yr = total;
  }
  return schools;
}
