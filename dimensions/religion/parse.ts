import { num, readCsvShared, text } from '../../lib/csv.ts';

export interface Faith {
  ethos: string | null;
  diocese: string | null;
}

/** "Diocese is not trustees" says the school has no diocese, so it is not one. */
export function dioceseOf(value: string | undefined): string | null {
  const v = text(value);
  return v === null || /^diocese is not trustees$/i.test(v) ? null : v;
}

/** The religious ethos and diocese of every school that has either ("Does not apply" and "None" are null). */
export async function loadFaith(file: string): Promise<Map<number, Faith>> {
  const found = new Map<number, Faith>();
  // Shared parse: gias-core reads the same file in the same build
  for await (const row of readCsvShared(file, 'windows-1252')) {
    const urn = num(row.URN);
    if (urn === null) continue;
    const ethos = text(row['ReligiousEthos (name)']);
    const diocese = dioceseOf(row['Diocese (name)']);
    if (ethos !== null || diocese !== null) found.set(urn, { ethos, diocese });
  }
  return found;
}
