export type Theme = 'light' | 'dark';
export type PaletteName = 'diverging' | 'sequential';

/**
 * Five colours per palette; a mode's buckets point at them by index (4 = best / highest).
 *
 * `diverging` (red ↔ grey ↔ blue) is for measures with a good and a bad direction. Each arm
 * steps monotonically in lightness and was checked with the dataviz palette validator. Dark
 * mode flips the anchor so the extremes are the brightest marks on the dark basemap.
 *
 * `sequential` (one teal hue, light to dark) is for measures with no good or bad direction,
 * such as school size or share of pupils. Checked with the validator's --ordinal mode.
 */
export const PALETTES: Record<PaletteName, Record<Theme, string[]>> = {
  diverging: {
    light: ['#c43a3a', '#ef9a93', '#d4d3ce', '#86b6ef', '#1c5cab'],
    dark: ['#f2a7a1', '#b5504e', '#5a5955', '#2a78d6', '#9ec5f4'],
  },
  sequential: {
    light: ['#6fbcb1', '#46a094', '#27827a', '#126560', '#07443f'],
    dark: ['#1f7d73', '#3ea89c', '#6bc3b8', '#9edcd2', '#d3f0ea'],
  },
};

/** Draw order on the map: extremes on top so they aren't hidden under average schools. */
export function drawOrder(palette: PaletteName, colour: number): number {
  if (colour < 0) return colour;
  return palette === 'diverging' ? Math.abs(colour - 2) : colour;
}
