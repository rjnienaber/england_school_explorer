import { academicYear } from '../../lib/ees.ts';
import { num, readCsv, text } from '../../lib/csv.ts';

export interface ExclusionsRow {
  /** Academic year label, e.g. "2024/25". */
  year: string;
  /** Pupils on roll (headcount) the rates are based on. */
  pupils: number;
  /** Suspensions per 100 pupils (one pupil can be suspended more than once). */
  suspensionRate: number | null;
  /** Number of suspensions. */
  suspensions: number | null;
  /** % of pupils suspended at least once. */
  suspendedPupilsPct: number | null;
  /** Number of permanent exclusions. */
  permanentExclusions: number | null;
  /** Permanent exclusions per 100 pupils. */
  permanentExclusionRate: number | null;
}

/**
 * Reads the latest year's secondary rows of "Suspensions and permanent exclusions - school level". The file holds
 * every year since 2006/07 (and primary and special schools), so the latest year is whichever time_period is
 * highest; only one small row per school is kept while streaming. Rates are per 100 pupils on roll (checked:
 * suspensions / headcount * 100). Schools with no pupils on roll have suppressed rates and are skipped.
 */
export async function loadExclusions(file: string): Promise<Map<number, ExclusionsRow>> {
  const bySchool = new Map<number, { period: string; row: ExclusionsRow }>();
  let latest = '';
  for await (const r of readCsv(file)) {
    if (text(r.education_phase) !== 'State-funded secondary') continue;
    const urn = num(r.school_urn);
    const period = r.time_period;
    const pupils = num(r.headcount);
    if (urn === null || !period || !pupils) continue;
    if (period > latest) latest = period;
    const have = bySchool.get(urn);
    if (have && have.period >= period) continue;
    bySchool.set(urn, {
      period,
      row: {
        year: academicYear(period),
        pupils,
        suspensionRate: num(r.susp_rate),
        suspensions: num(r.suspension),
        suspendedPupilsPct: num(r.one_plus_susp_rate),
        permanentExclusions: num(r.perm_excl),
        permanentExclusionRate: num(r.perm_excl_rate),
      },
    });
  }
  // A school that closed or stopped reporting earlier would otherwise show an old year next to current ones
  const out = new Map<number, ExclusionsRow>();
  for (const [urn, { period, row }] of bySchool) if (period === latest) out.set(urn, row);
  return out;
}
