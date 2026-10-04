// Progress 8 bands, shared by the build (the field's allowed values) and the browser.

/** DfE Progress 8 bands, best first. */
export const P8_BANDS = ['well-above', 'above', 'average', 'below', 'well-below'] as const;
export type P8Band = (typeof P8_BANDS)[number];

export const P8_LABELS: Record<P8Band, string> = {
  'well-above': 'Well above average',
  above: 'Above average',
  average: 'Average',
  below: 'Below average',
  'well-below': 'Well below average',
};

/**
 * DfE's Progress 8 banding. A school is only above or below average when its
 * whole 95% confidence interval is, and "well" above or below when the score
 * itself is also beyond ±0.5.
 */
export function p8Band(score: number, lower: number, upper: number): P8Band {
  if (lower > 0) return score >= 0.5 ? 'well-above' : 'above';
  if (upper < 0) return score <= -0.5 ? 'well-below' : 'below';
  return 'average';
}
