// Mainstream schools that run a specialist SEN unit or resourced provision, and for which types
// of need. Straight from the GIAS register, so it is only as current as the school's last update.

import { defineDimension } from '../../lib/dimension.ts';
import { loadSenProvision } from './parse.ts';

export const module = defineDimension({
  id: 'sen-provision',
  title: 'SEN units and resourced provision',
  dependsOn: ['gias-core'],
  fields: {
    senProvision: {
      type: 'enum',
      values: ['resourced', 'unit', 'both'],
      placement: 'mode',
      label: 'SEN unit or resourced provision',
      description:
        'Whether the school runs resourced provision (specialist places for pupils on the mainstream roll), an SEN unit (a separate specialist class), or both. From the school register, so it can be out of date. Not set where the school has neither.',
      source: 'gias',
    },
    senNeeds: {
      type: 'string',
      placement: 'mode',
      label: 'Types of need the provision caters for',
      description:
        'Comma-separated codes from the school register: ASD, SLCN, SEMH, MLD, SLD, PMLD, SpLD, PD, HI, VI, MSI, OTH. Only set for schools with a unit or resourced provision, and not every such school lists its needs.',
      source: 'gias',
    },
    senPlaces: {
      type: 'number',
      placement: 'detail',
      label: 'Places in the SEN unit or resourced provision',
      description: 'Unit and resourced-provision capacity added together, where the school register gives one. Often blank.',
      source: 'gias',
    },
  },

  async build(ctx) {
    const found = await loadSenProvision(ctx.dataPath('gias'));
    const rows = [];
    for (const urn of ctx.schools.urns) {
      const s = found.get(urn);
      if (s) rows.push({ urn, senProvision: s.kind, senNeeds: s.needs, senPlaces: s.places });
    }
    ctx.log(`${rows.length} schools with an SEN unit or resourced provision`);
    return rows;
  },
});
