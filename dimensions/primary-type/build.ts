// Whether a primary school is an infant school, a junior school or both together, from the age range in GIAS.
// Primary phase only: it is what the "Type of school" filter for primaries uses.

import { defineDimension } from '../../lib/dimension.ts';

export const PRIMARY_TYPES = ['infant', 'junior', 'all'] as const;
export type PrimaryType = (typeof PRIMARY_TYPES)[number];

/** Infant schools stop at 7 (a few at 8), junior schools start at 7; the rest (usually 4 to 11) cover both. */
export function primaryTypeOf(ageLow: number | null, ageHigh: number | null): PrimaryType | null {
  if (ageLow === null || ageHigh === null) return null;
  if (ageHigh <= 8) return 'infant';
  if (ageLow >= 7) return 'junior';
  return 'all';
}

export const module = defineDimension({
  id: 'primary-type',
  title: 'Infant, junior or primary (from the age range)',
  dependsOn: ['gias-core'],
  phases: ['primary'],
  fields: {
    primaryType: {
      type: 'enum',
      values: PRIMARY_TYPES,
      placement: 'mode',
      label: 'Infant, junior or primary',
      description: "'infant' = highest age 8 or under; 'junior' = lowest age 7 or over; 'all' = covers both (usually ages 4 to 11). Worked out from GIAS's statutory age range.",
      source: 'gias',
    },
  },

  build(ctx) {
    const rows = [];
    const counts = { infant: 0, junior: 0, all: 0 };
    for (const [urn, g] of ctx.read('gias-core')) {
      const primaryType = primaryTypeOf(g.ageLow as number | null, g.ageHigh as number | null);
      if (primaryType === null) continue;
      counts[primaryType]++;
      rows.push({ urn, primaryType });
    }
    ctx.log(`${counts.infant} infant, ${counts.junior} junior, ${counts.all} all-through primary schools`);
    return rows;
  },
});
