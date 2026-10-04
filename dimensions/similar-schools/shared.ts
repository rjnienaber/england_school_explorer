// Reading the similar-school set back, for the browser (this file runs there too) and for anything
// that wants to compare like with like, such as the shortlist comparison. The set is stored on each
// school as `similarUrns`, a popup field: the URNs of its nearest schools, nearest first, joined by '-'.

/** The URNs stored in a school's `similarUrns` field (empty for none). */
export function parseSimilar(similarUrns: string | null | undefined): number[] {
  return (similarUrns ?? '')
    .split('-')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * The value of the "similar" focus filter (and of `?similar=` in the address) for a school: its own URN
 * first, then its similar schools. The filter keeps exactly these schools.
 */
export const similarFocusValue = (urn: number, similarUrns: string | null | undefined) => [urn, ...parseSimilar(similarUrns)].join('-');

/** The short form of a focus value for the address: just the school's URN (`?similar=<urn>`). */
export const similarUrlValue = (value: string) => value.split('-')[0];

/**
 * The full focus value for what `?similar=` holds. A short value (just a URN) is completed from that school's
 * `similarUrns`, which `load` fetches; an old long link (`<urn>-<urn>-...`) already is complete and is kept.
 * A value that can't be completed is returned as it is.
 */
export async function resolveSimilar(value: string, load: (urn: number) => Promise<{ similarUrns?: string | null } | undefined>): Promise<string> {
  const urn = Number(value);
  if (!Number.isInteger(urn) || urn <= 0 || String(urn) !== value) return value;
  const school = await load(urn);
  return similarFocusValue(urn, school?.similarUrns);
}

/** Position (1 = best) of `value` among `values` plus itself, and how many values count. Ties share the better place. */
export function rankAmong(value: number, others: (number | null | undefined)[], higherIsBetter: boolean): { rank: number; of: number } {
  const known = others.filter((v): v is number => typeof v === 'number');
  const better = known.filter((v) => (higherIsBetter ? v > value : v < value)).length;
  return { rank: better + 1, of: known.length + 1 };
}
