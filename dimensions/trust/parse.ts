import { num, readCsvShared, text } from '../../lib/csv.ts';

export interface TrustMembership {
  /** GIAS trust code ("Trusts (code)"), a number written as text, e.g. "17396". */
  id: string;
  name: string;
}

/** The trust each school belongs to, from the GIAS register. Schools in no trust are absent. */
export async function loadTrusts(file: string): Promise<Map<number, TrustMembership>> {
  const trusts = new Map<number, TrustMembership>();
  // Shared parse: gias-core reads the same file in the same build
  for await (const row of readCsvShared(file, 'windows-1252')) {
    const urn = num(row.URN);
    const id = text(row['Trusts (code)']);
    const name = text(row['Trusts (name)']);
    if (urn !== null && id && name) trusts.set(urn, { id, name });
  }
  return trusts;
}
