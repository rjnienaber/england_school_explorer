// Shared by build.ts and web.ts: the value-added bands and the A level points scale.

export const VA_BANDS = ['well-above', 'above', 'average', 'below', 'well-below'] as const;
export type VaBand = (typeof VA_BANDS)[number];

/** DfE's `progress_banding` wording. */
export const VA_BAND_OF_DFE: Record<string, VaBand> = {
  'Well above average': 'well-above',
  'Above average': 'above',
  Average: 'average',
  'Below average': 'below',
  'Well below average': 'well-below',
};

/**
 * Average points per A level entry as a grade. A level points are A* 60, A 50, B 40, C 30, D 20, E 10, with a
 * third of a grade (3.33 points) for each + or -; the grade is the nearest step (checked against the DfE's own
 * `aps_per_entry_grade`, which is what this reproduces). Used only for the typical school.
 */
export function gradeOfPoints(points: number): string {
  const letters = ['E', 'D', 'C', 'B', 'A'];
  const steps: [string, number][] = [['U', 0]];
  letters.forEach((letter, i) => {
    const base = 10 * (i + 1);
    steps.push([`${letter}-`, base - 10 / 3], [letter, base], [`${letter}+`, base + 10 / 3]);
  });
  steps.push(['A*-', 56.67], ['A*', 60]);
  let best = steps[0];
  for (const s of steps) if (Math.abs(s[1] - points) < Math.abs(best[1] - points)) best = s;
  return best[0];
}
