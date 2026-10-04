// The shortlist itself: which schools, kept in the address (?compare=100049,137181) and in localStorage.
// Each phase has its own list: secondary keeps the plain link and storage key it always had, primary adds
// `&phase=primary` to the link and has a key of its own. A link without a phase opens in secondary.
// Pure code (browser and tests).

import { DEFAULT_PHASE, type Phase } from '../../lib/phase.ts';

/** Most schools on a shortlist: the number of preferences most councils allow on a school application (secondary: some allow 3 to 5; primary: 3 to 6). */
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

/** Where a phase's saved shortlist is kept in localStorage. Secondary keeps its original key, so saved lists survive. */
export const shortlistStoreKey = (phase: Phase) => (phase === DEFAULT_PHASE ? 'schools-shortlist' : `schools-shortlist-${phase}`);

/** The shareable link for a list: the page's own address with just `?compare=` (and `phase=` outside secondary). */
export function shortlistLink(href: string, phase: Phase, urns: number[]): string {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  return `${url.toString()}?compare=${shortlistValue(urns)}${phase === DEFAULT_PHASE ? '' : `&phase=${phase}`}`;
}
