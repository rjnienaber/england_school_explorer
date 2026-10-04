import { academicYear } from '../../lib/ees.ts';
import { num, readCsv, text } from '../../lib/csv.ts';
import { VA_BAND_OF_DFE, type VaBand } from './grades.ts';

export interface SixthFormRow {
  /** Results year as an academic year label, e.g. "2024/25". */
  year: string;
  /** Students whose average points per entry was counted. */
  students: number | null;
  /** Average points per A level entry (A* = 60 ... E = 10) and the grade it equals, e.g. "B-". */
  aps: number | null;
  grade: string | null;
  /** Average points of each student's best three A levels, and the grade. */
  best3Aps: number | null;
  best3Grade: string | null;
  /** % of students with at least AAB in their best three A levels, two of them in facilitating subjects. */
  aabPct: number | null;
  /** Value added (A level progress) with its 95% confidence interval, and the DfE band. */
  va: number | null;
  vaLower: number | null;
  vaUpper: number | null;
  vaBand: VaBand | null;
  /** % of students who stayed to the end of their courses. */
  retainedPct: number | null;
}

/**
 * Reads the latest year of "A level and other 16 to 18 results: Schools and colleges - performance". The file has
 * four years, every school and college, six exam cohorts (`Academic`, `A level`, `Applied general`, `Tech level`,
 * ...) and `Total`/`Disadvantaged`/`Not disadvantaged` groups; only `A level` and `Total` are kept. Missing values
 * are `z` (not applicable, e.g. no A level students) and `c` (suppressed). Value added and its band are only
 * published for the last two years. A school with every figure missing gets no row.
 */
export async function loadSixthForm(file: string): Promise<Map<number, SixthFormRow>> {
  const out = new Map<number, SixthFormRow>();
  let latest = '';
  for await (const r of readCsv(file)) {
    if (r.exam_cohort !== 'A level' || r.disadvantage_status !== 'Total') continue;
    const urn = num(r.school_urn);
    const period = r.time_period;
    if (urn === null || !period || period < latest) continue;
    if (period > latest) {
      latest = period;
      out.clear();
    }
    const bandText = text(r.progress_banding);
    const row: SixthFormRow = {
      year: academicYear(period),
      students: num(r.aps_per_entry_student_count),
      aps: num(r.aps_per_entry),
      grade: text(r.aps_per_entry_grade),
      best3Aps: num(r.best_three_alevels_aps),
      best3Grade: text(r.best_three_alevels_grade),
      aabPct: num(r.aab_percent),
      va: num(r.value_added),
      vaLower: num(r.value_added_lower_ci),
      vaUpper: num(r.value_added_upper_ci),
      vaBand: bandText === null ? null : (VA_BAND_OF_DFE[bandText] ?? null),
      retainedPct: num(r.retained_percent),
    };
    if (row.aps === null && row.grade === null && row.va === null && row.aabPct === null) continue;
    out.set(urn, row);
  }
  return out;
}
