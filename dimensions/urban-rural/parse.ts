import { num, readCsvShared, text } from '../../lib/csv.ts';

export interface UrbanRural {
  /** The broad group. */
  area: 'urban' | 'rural';
  /** The original category, tidied for display ("Larger rural: Nearer to a major town or city"). */
  detail: string;
}

/**
 * Groups one GIAS `UrbanRural (name)` label. England's schools carry the six-category version
 * ("Urban: Nearer to a major town or city"), but older records use the eight-category ONS names
 * ("(England/Wales) Urban city and town"); both say Urban or Rural. Blank, "(pseudo) Channel
 * Islands/Isle of Man" and the odd Scottish label are not classified.
 */
export function classify(label: string | null): UrbanRural | null {
  if (!label || /^\((pseudo|Scotland)\)/.test(label)) return null;
  const detail = label.replace(/^\(England\/Wales\)\s*/, '');
  if (/^urban\b/i.test(detail)) return { area: 'urban', detail };
  if (/\brural\b/i.test(detail)) return { area: 'rural', detail };
  return null;
}

export async function loadUrbanRural(file: string): Promise<Map<number, UrbanRural>> {
  const found = new Map<number, UrbanRural>();
  // Shared parse: gias-core reads the same file in the same build
  for await (const row of readCsvShared(file, 'windows-1252')) {
    const urn = num(row.URN);
    const c = classify(text(row['UrbanRural (name)']));
    if (urn !== null && c) found.set(urn, c);
  }
  return found;
}
