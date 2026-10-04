// The fifths shown in the filter and popup, shared by web.ts and the tests. Fifth 1 is the most
// deprived: it holds deciles 1 and 2.

export const FIFTH_LABELS = [
  'Most deprived fifth',
  '2nd most deprived fifth',
  'Middle fifth',
  '2nd least deprived fifth',
  'Least deprived fifth',
] as const;

/** 1 (most deprived) to 5 (least deprived) for a decile 1-10. */
export const fifthOf = (decile: number): number => Math.ceil(decile / 2);
