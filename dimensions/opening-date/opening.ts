// Pure wording for the opening line in the popup (kept apart from web.ts so tests can pass a date).

import type { OpenReason } from './parse.ts';

const MONTHS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

/** A school counts as new for this many years after it opens. */
export const NEW_FOR_YEARS = 5;

export interface Opening {
  line: string;
  /** True for a recently opened new school that has no Attainment 8 score. */
  explainsNoResults: boolean;
}

/** The line to show, or null when there is nothing worth saying. */
export function describeOpening(openDate: string | null, openReason: OpenReason | null, hasResults: boolean, now: Date): Opening | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(openDate ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (openReason === 'academy') return { line: `Became an academy in ${year}`, explainsNoResults: false };
  if (openReason !== 'new') return null;
  const age = (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() - month);
  if (age < 0 || age > NEW_FOR_YEARS * 12) return null;
  return { line: `Opened ${MONTHS[month]} ${year} (new school)`, explainsNoResults: !hasResults };
}
