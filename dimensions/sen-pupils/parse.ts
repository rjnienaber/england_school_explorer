import { num, readCsv } from '../../lib/csv.ts';
import { academicYear } from '../../lib/ees.ts';

export interface SenPupils {
  /** Academic year of the January census, e.g. "2025/26". */
  year: string;
  /** Pupils on roll (the base of the percentages). */
  pupils: number;
  /** % of pupils with an education, health and care plan. */
  ehcpPct: number;
  /** % of pupils on SEN support (special needs help from the school, no plan). */
  supportPct: number;
}

/**
 * Reads "Special educational needs in England: School level data". `source.ts` stores only the whole-school rows
 * (unit type "All pupils", primary need "All pupils"), three per school: all pupils, SEN support, and EHC plans.
 * The file gives counts, not percentages, so they are worked out here. A school with no pupils gets no row.
 * The school URN is written as a number in scientific notation in one case ("1.00E+05"), which `num` reads.
 */
export async function loadSenPupils(file: string): Promise<Map<number, SenPupils>> {
  const bySchool = new Map<number, { period: string; all?: number; support?: number; ehcp?: number }>();
  for await (const r of readCsv(file)) {
    const urn = num(r.school_urn);
    const count = num(r.pupil_count);
    if (urn === null || count === null) continue;
    let s = bySchool.get(urn);
    if (!s) bySchool.set(urn, (s = { period: r.time_period }));
    if (r.sen_provision === 'All pupils') s.all = count;
    else if (r.sen_provision === 'SEN support') s.support = count;
    else if (r.sen_provision === 'Education, health and care plans') s.ehcp = count;
  }
  let latest = '';
  for (const s of bySchool.values()) if (s.period > latest) latest = s.period;
  const out = new Map<number, SenPupils>();
  for (const [urn, s] of bySchool) {
    if (s.period !== latest || !s.all || s.support === undefined || s.ehcp === undefined) continue;
    out.set(urn, {
      year: academicYear(s.period),
      pupils: s.all,
      ehcpPct: Math.round((s.ehcp / s.all) * 1000) / 10,
      supportPct: Math.round((s.support / s.all) * 1000) / 10,
    });
  }
  return out;
}
