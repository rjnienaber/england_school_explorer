import { num, readCsvShared } from '../../lib/csv.ts';

/** GIAS gives a school's capacity as 0 or blank when it is unknown, so both mean "no figure". */
export async function loadCapacity(file: string): Promise<Map<number, number>> {
  const capacity = new Map<number, number>();
  // Shared parse: gias-core reads the same file in the same build
  for await (const row of readCsvShared(file, 'windows-1252')) {
    const urn = num(row.URN);
    const c = num(row.SchoolCapacity);
    if (urn !== null && c !== null && c > 0) capacity.set(urn, c);
  }
  return capacity;
}
