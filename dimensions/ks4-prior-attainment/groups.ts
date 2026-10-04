// The three prior-attainment groups, shared by the build and the browser.

/** Pupils grouped by their key stage 2 (age 11) results, lowest first. */
export const PRIOR_GROUPS = ['Low', 'Mid', 'High'] as const;
export type PriorGroup = (typeof PRIOR_GROUPS)[number];

/** The `breakdown` value DfE uses in the KS4 file for each group. */
export const PRIOR_BREAKDOWNS: Record<string, PriorGroup> = {
  'Low prior attainment': 'Low',
  'Mid prior attainment': 'Mid',
  'High prior attainment': 'High',
};

export const PRIOR_LABELS: Record<PriorGroup, string> = { Low: 'Low', Mid: 'Middle', High: 'High' };

/** What each group means: its pupils' KS2 reading and maths results against the expected standard. */
export const PRIOR_EXPLANATIONS: Record<PriorGroup, string> = {
  Low: 'below the expected standard at age 11',
  Mid: 'at the expected standard at age 11',
  High: 'above the expected standard at age 11',
};
