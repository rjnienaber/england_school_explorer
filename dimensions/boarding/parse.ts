import { num, readCsvShared, text } from '../../lib/csv.ts';

/**
 * Whether one GIAS `Boarders (name)` value means a boarding school. Only "Boarding school" counts:
 * "No boarders", "Not applicable" and blank do not, and nor do the few children's homes and
 * college residential places, which are a different kind of setting.
 */
export function isBoarding(label: string | null): boolean {
  return label === 'Boarding school';
}

/** URNs of the schools the register lists as boarding schools. */
export async function loadBoarding(file: string): Promise<Set<number>> {
  const found = new Set<number>();
  // Shared parse: gias-core reads the same file in the same build
  for await (const row of readCsvShared(file, 'windows-1252')) {
    const urn = num(row.URN);
    if (urn !== null && isBoarding(text(row['Boarders (name)']))) found.add(urn);
  }
  return found;
}
