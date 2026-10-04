// How full a school is: pupils on roll divided by the capacity GIAS records. DfE publishes no
// applications or offers per school, so fullness is the nearest proxy for popularity.

import { defineDimension } from '../../lib/dimension.ts';
import { loadCapacity } from './parse.ts';

export const module = defineDimension({
  id: 'school-capacity',
  title: 'How full the school is (pupils ÷ capacity)',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    capacity: {
      type: 'number',
      placement: 'detail',
      label: 'School capacity',
      description:
        'Number of pupils the school is designed for, as recorded in the school register. Can be out of date, and includes the sixth form where there is one. Independent schools report it themselves.',
      source: 'gias',
    },
    fullPct: {
      type: 'number',
      decimals: 0,
      unit: '%',
      placement: 'mode',
      label: 'How full (pupils ÷ capacity)',
      description:
        'Pupils on roll as a percentage of capacity, rounded to a whole number. Over 100 means more pupils than the recorded capacity. Not set where capacity is missing or 0.',
      source: 'gias',
    },
  },

  async build(ctx) {
    const capacity = await loadCapacity(ctx.dataPath('gias'));
    const pupils = ctx.read('gias-core');
    const rows = [];
    let over = 0;
    for (const urn of ctx.schools.urns) {
      const cap = capacity.get(urn);
      if (cap === undefined) continue;
      const n = pupils.get(urn)?.pupils;
      const fullPct = typeof n === 'number' ? Math.round((n / cap) * 100) : null;
      if (fullPct !== null && fullPct > 100) over++;
      rows.push({ urn, capacity: cap, fullPct });
    }
    ctx.log(`${rows.length} schools with a capacity; ${over} over capacity`);
    return rows;
  },
});
