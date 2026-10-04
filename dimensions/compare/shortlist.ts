// The shortlist itself: which schools, kept in the address (?compare=100049,137181) and in localStorage.
// Pure code (browser and tests).

/** Most schools on a shortlist: the number of preferences most councils allow on the secondary application (some allow 3 to 5). */
export const MAX_SHORTLIST = 6;

/** URNs from a `?compare=` value or a saved string: whole positive numbers separated by commas, no repeats, at most six. */
export function parseShortlist(value: string | null | undefined): number[] {
  const seen = new Set<number>();
  for (const part of (value ?? '').split(',')) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen].slice(0, MAX_SHORTLIST);
}

export const shortlistValue = (urns: number[]) => urns.join(',');

/** The list with `urn` added at the end, unless it is already there or the list is full. */
export function withSchool(list: number[], urn: number): number[] {
  return list.includes(urn) || list.length >= MAX_SHORTLIST ? list : [...list, urn];
}

export const withoutSchool = (list: number[], urn: number) => list.filter((u) => u !== urn);
