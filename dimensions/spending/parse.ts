import { num, readCsv } from '../../lib/csv.ts';

export interface SpendingRow {
  /** `cfr` (maintained school, Consistent Financial Reporting) or `aar` (academy, Academies Accounts Return). */
  basis: 'cfr' | 'aar';
  /** Financial year as "2024/25". */
  year: string;
  /** Total expenditure in pounds per pupil, whole pounds. */
  spendPerPupil: number;
  /** Teaching staff costs as a % of total expenditure. */
  teachingStaffSpendPct: number | null;
}

/**
 * Reads the spending file `source.ts` wrote. A school with a figure for the whole year gets a row; the rest are left out:
 *   - no spending supplied (the source marks it `n/s`), or no pupils;
 *   - a return that covers only part of a year (a new academy, or a school that joined or left) because its spending would
 *     look low against a full year. An academy that changed trust part-way through has one return for each trust: these are
 *     added together, and used when they cover 12 months between them.
 */
export async function loadSpending(file: string): Promise<Map<number, SpendingRow>> {
  interface Acc {
    basis: 'cfr' | 'aar';
    year: string;
    months: number;
    pupils: number;
    spend: number;
    teaching: number;
    teachingKnown: boolean;
  }
  const acc = new Map<number, Acc>();
  for await (const r of readCsv(file)) {
    const urn = num(r.urn);
    const months = num(r.months);
    const spend = num(r.total_spend);
    const pupils = num(r.pupils);
    if (urn === null || months === null || spend === null || !pupils || pupils <= 0) continue;
    const a = acc.get(urn) ?? { basis: r.basis as 'cfr' | 'aar', year: r.year, months: 0, pupils, spend: 0, teaching: 0, teachingKnown: true };
    const teaching = num(r.teaching_spend);
    a.months += months;
    a.spend += spend;
    a.pupils = Math.max(a.pupils, pupils);
    if (teaching === null) a.teachingKnown = false;
    else a.teaching += teaching;
    acc.set(urn, a);
  }
  const out = new Map<number, SpendingRow>();
  for (const [urn, a] of acc) {
    if (a.months !== 12 || a.spend <= 0) continue;
    out.set(urn, {
      basis: a.basis,
      year: a.year,
      spendPerPupil: a.spend / a.pupils,
      teachingStaffSpendPct: a.teachingKnown ? (a.teaching / a.spend) * 100 : null,
    });
  }
  return out;
}
