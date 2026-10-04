// Boarding schools, straight from the GIAS register ("Boarders" column). Mostly independent
// schools, plus a few state boarding schools.

import { defineDimension } from '../../lib/dimension.ts';
import { loadBoarding } from './parse.ts';

export const module = defineDimension({
  id: 'boarding',
  title: 'Boarding schools',
  dependsOn: ['gias-core'],
  fields: {
    boarding: {
      type: 'boolean',
      placement: 'mode',
      label: 'Boarding school',
      description:
        'Whether the school register lists the school as a boarding school (pupils can live at the school). False for schools that say they have no boarders, and where the register is blank. Can be out of date.',
      source: 'gias',
      nullable: false,
      default: false,
    },
  },

  async build(ctx) {
    const found = await loadBoarding(ctx.dataPath('gias'));
    const rows = [];
    for (const urn of ctx.schools.urns) if (found.has(urn)) rows.push({ urn, boarding: true });
    ctx.log(`${rows.length} boarding schools`);
    return rows;
  },
});
