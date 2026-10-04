// KS2 progress bands, shared by the build (the field's allowed values) and the browser.

/** Best first. */
export const PROGRESS_BANDS = ['above', 'average', 'below'] as const;
export type ProgressBand = (typeof PROGRESS_BANDS)[number];

export const PROGRESS_LABELS: Record<ProgressBand, string> = {
  above: 'Above average',
  average: 'Average',
  below: 'Below average',
};

/** Pupils fewer than this are "a small group" for the caveats. */
export const SMALL_COHORT = 30;

export interface ProgressScore {
  score: number | null;
  lower: number | null;
  upper: number | null;
}

/**
 * One band from the three subject progress scores (reading, writing, maths). DfE says a subject is above or below
 * average only when its whole 95% confidence interval is. A school is above (or below) average here when most of the
 * subjects it has a score for are, and none is the other way: one subject out of three beyond the line is within what
 * chance gives often enough that it does not count. This overall band is our own, not a DfE measure.
 */
export function progressBand(subjects: ProgressScore[]): ProgressBand | null {
  const known = subjects.filter((s) => s.score !== null && s.lower !== null && s.upper !== null);
  if (known.length === 0) return null;
  const above = known.filter((s) => s.lower! > 0).length;
  const below = known.filter((s) => s.upper! < 0).length;
  if (above > known.length / 2 && below === 0) return 'above';
  if (below > known.length / 2 && above === 0) return 'below';
  return 'average';
}
