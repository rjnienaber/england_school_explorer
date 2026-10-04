import { num, readCsvShared, text } from '../../lib/csv.ts';

export type OpenReason = 'new' | 'academy' | 'other';

export interface Opening {
  /** ISO date (2023-09-01), or null when the register has none. */
  date: string | null;
  reason: OpenReason | null;
}

/** GIAS dates are dd-mm-yyyy. Returns the ISO date, or null for blank or impossible dates. */
export function isoDate(value: string | null): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value ?? '');
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return date.getUTCDate() === Number(d) && date.getUTCMonth() === Number(mo) - 1 ? `${y}-${mo}-${d}` : null;
}

/**
 * Groups one GIAS `ReasonEstablishmentOpened (name)` value. "New" is a school that did not exist
 * before (new provision, free schools, new nursery schools); "academy" is a conversion of an
 * existing school (Academy Converter, Academy Sponsor Led and the like). Everything else the
 * register records (amalgamations, fresh starts, change of religious character, splits...) is
 * "other", and "Not applicable", "Not Recorded" and blank are unknown.
 */
export function openReason(label: string | null): OpenReason | null {
  if (!label || label === 'Not applicable' || label === 'Not Recorded') return null;
  if (label === 'Academy Free School' || label === 'Free Special School') return 'new';
  if (/^new\b/i.test(label)) return 'new';
  if (/^academy\b/i.test(label)) return 'academy';
  return 'other';
}

/** The opening date and reason of every school in the register that has either. */
export async function loadOpening(file: string): Promise<Map<number, Opening>> {
  const found = new Map<number, Opening>();
  // Shared parse: gias-core reads the same file in the same build
  for await (const row of readCsvShared(file, 'windows-1252')) {
    const urn = num(row.URN);
    if (urn === null) continue;
    const date = isoDate(text(row.OpenDate));
    const reason = openReason(text(row['ReasonEstablishmentOpened (name)']));
    if (date || reason) found.set(urn, { date, reason });
  }
  return found;
}
