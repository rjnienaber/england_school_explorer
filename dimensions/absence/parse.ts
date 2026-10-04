import { academicYear } from '../../lib/ees.ts';
import { num, readCsv, text } from '../../lib/csv.ts';

export interface AbsenceRow {
  /** Academic year label, e.g. "2024/25". */
  year: string;
  /** Pupils on roll counted in the absence figures (enrolments). */
  pupils: number | null;
  /** % of possible sessions missed, for any reason. */
  overallPct: number | null;
  /** % of possible sessions missed without a school-approved reason. */
  unauthorisedPct: number | null;
  /** % of pupils who missed 10% or more of their sessions. */
  persistentPct: number | null;
  /** % of pupils who missed 50% or more of their sessions. */
  severePct: number | null;
}

// The phases kept: the file also holds special schools and alternative provision
const PHASES = new Set(['State-funded secondary', 'State-funded primary']);

/**
 * Reads the latest year's secondary and primary rows of "Absence rates by school level": one per school (all-through
 * schools have a single row, tagged State-funded secondary, covering the whole school). Special rows are skipped.
 * The file holds every year since 2013/14, so the latest year is whichever time_period is highest.
 */
export async function loadAbsence(file: string): Promise<Map<number, AbsenceRow>> {
  const bySchool = new Map<number, { period: string; row: AbsenceRow }>();
  let latest = '';
  for await (const r of readCsv(file)) {
    if (!PHASES.has(text(r.education_phase) ?? '')) continue;
    const urn = num(r.school_urn);
    const period = r.time_period;
    if (urn === null || !period) continue;
    if (period > latest) latest = period;
    const have = bySchool.get(urn);
    if (have && have.period >= period) continue;
    bySchool.set(urn, {
      period,
      row: {
        year: academicYear(period),
        pupils: num(r.enrolments),
        overallPct: num(r.sess_overall_percent),
        unauthorisedPct: num(r.sess_unauthorised_percent),
        persistentPct: num(r.enrolments_pa_10_exact_percent),
        severePct: num(r.enrolments_pa_50_exact_percent),
      },
    });
  }
  // A school that closed or stopped reporting earlier would otherwise show an old year next to current ones
  const out = new Map<number, AbsenceRow>();
  for (const [urn, { period, row }] of bySchool) if (period === latest) out.set(urn, row);
  return out;
}
