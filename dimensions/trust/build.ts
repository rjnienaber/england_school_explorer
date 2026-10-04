// Which multi-academy trust (or other GIAS "trust") each school belongs to. The name is a field of
// gias-core; this adds the trust's code, which is what the "this trust only" view is keyed by (two
// trusts can share a name, a name can be respelled), and how many mapped schools the trust has.
// The trust's own results are not stored: the browser summarises them from the schools' fields.

import { defineDimension } from '../../lib/dimension.ts';
import { loadTrusts } from './parse.ts';

export const module = defineDimension({
  id: 'trust',
  title: 'Trusts',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    trustId: {
      type: 'string',
      placement: 'mode',
      label: 'Trust code',
      description: 'The trust\'s code in the school register (GIAS "Trusts (code)"). Schools with the same code are in the same trust.',
      source: 'gias',
    },
    trustSchools: {
      type: 'number',
      placement: 'detail',
      label: 'Schools in the trust on this map',
      description: 'How many of the mapped schools in this phase belong to the same trust, this one included. A trust may run other schools (the other phase, special schools) that are not in this dataset.',
      source: 'gias',
      decimals: 0,
    },
  },

  async build(ctx) {
    const trusts = await loadTrusts(ctx.dataPath('gias'));
    const members = new Map<string, number[]>();
    for (const urn of ctx.schools.urns) {
      const t = trusts.get(urn);
      if (t) members.set(t.id, [...(members.get(t.id) ?? []), urn]);
    }
    const rows = [...members].flatMap(([trustId, urns]) => urns.map((urn) => ({ urn, trustId, trustSchools: urns.length })));
    const largest = Math.max(0, ...[...members.values()].map((u) => u.length));
    ctx.log(`${rows.length} schools in ${members.size} trusts (largest has ${largest} mapped schools)`);
    return rows;
  },
});
