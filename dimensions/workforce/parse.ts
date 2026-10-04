import { academicYear } from '../../lib/ees.ts';
import { num, readCsv } from '../../lib/csv.ts';

export interface WorkforceRow {
  /** Academic year of the November workforce census, e.g. "2025/26". */
  year: string;
  /** Teachers, full-time equivalent (head, deputies, assistant heads and classroom teachers). */
  teachersFte: number;
  /** Teachers, headcount. */
  teachersHc: number | null;
  /** Teachers without qualified teacher status, full-time equivalent. */
  withoutQtsFte: number | null;
  /** % of teachers who work part time (by headcount). */
  partTimePct: number | null;
}

export interface SicknessRow {
  /** Academic year, e.g. "2024/25". */
  year: string;
  /** Average days of sickness absence per teacher (all teachers, whether or not they were off). */
  daysPerTeacher: number | null;
  /** % of teachers with at least one sickness absence in the year. */
  takingAbsencePct: number | null;
}

/**
 * Reads the workforce file that `source.ts` trimmed to the newest year (columns as in the catalogue CSV). A school with
 * no FTE teachers (suppressed `x`, or zero) gets no row. FTE figures are rounded by the DfE to 2 decimals.
 */
export async function loadWorkforce(file: string): Promise<Map<number, WorkforceRow>> {
  const out = new Map<number, WorkforceRow>();
  for await (const r of readCsv(file)) {
    const urn = num(r.school_urn);
    const fte = num(r.fte_all_teachers);
    if (urn === null || !fte || fte <= 0) continue;
    out.set(urn, {
      year: academicYear(r.time_period),
      teachersFte: fte,
      teachersHc: num(r.hc_all_teachers),
      withoutQtsFte: num(r.fte_all_teachers_without_qts),
      partTimePct: num(r.percent_pt_teacher),
    });
  }
  return out;
}

/** Reads the teacher sickness file, trimmed to the newest year. */
export async function loadSickness(file: string): Promise<Map<number, SicknessRow>> {
  const out = new Map<number, SicknessRow>();
  for await (const r of readCsv(file)) {
    const urn = num(r.school_urn);
    if (urn === null) continue;
    const days = num(r.average_number_of_days_all_teachers);
    const pct = num(r.percentage_taking_absence);
    if (days === null && pct === null) continue;
    out.set(urn, { year: academicYear(r.time_period), daysPerTeacher: days, takingAbsencePct: pct });
  }
  return out;
}
