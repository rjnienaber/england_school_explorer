// Whether a school is in an urban or rural area, from the GIAS register (the ONS rural-urban
// classification of the school's location, grouped by DfE).

import { defineDimension } from '../../lib/dimension.ts';
import { loadUrbanRural } from './parse.ts';

export const module = defineDimension({
  id: 'urban-rural',
  title: 'Urban or rural area',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    urbanRural: {
      type: 'enum',
      values: ['urban', 'rural'],
      placement: 'mode',
      label: 'Urban or rural',
      description:
        'Whether the school is in an urban or a rural area: the six Urban/Larger rural/Smaller rural categories of the school register (based on the ONS 2011 rural-urban classification) grouped into two. Not set where the register gives no classification.',
      source: 'gias',
    },
    urbanRuralDetail: {
      type: 'string',
      placement: 'detail',
      label: 'Urban or rural category',
      description:
        'The category the school register gives, for example "Larger rural: Nearer to a major town or city". It also says how far the area is from a major town or city.',
      source: 'gias',
    },
  },

  async build(ctx) {
    const found = await loadUrbanRural(ctx.dataPath('gias'));
    const rows = [];
    let rural = 0;
    for (const urn of ctx.schools.urns) {
      const s = found.get(urn);
      if (!s) continue;
      if (s.area === 'rural') rural++;
      rows.push({ urn, urbanRural: s.area, urbanRuralDetail: s.detail });
    }
    ctx.log(`${rows.length} schools classified, ${rural} rural`);
    return rows;
  },
});
