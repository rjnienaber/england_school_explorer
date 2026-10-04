// Religious ethos, diocese and a faith-school flag, from the GIAS register. The religious
// character itself (Roman Catholic, Church of England...) belongs to gias-core.

import { defineDimension } from '../../lib/dimension.ts';
import { isFaithSchool } from './faith.ts';
import { loadFaith } from './parse.ts';

export const module = defineDimension({
  id: 'religion',
  title: 'Religious ethos and diocese',
  dependsOn: ['gias-core'],
  phases: ['secondary', 'primary'],
  fields: {
    religiousEthos: {
      type: 'string',
      placement: 'detail',
      label: 'Religious ethos',
      description:
        'The ethos the school registers, which is mostly filled in for independent schools and often repeats the religious character. Not set where the register says it does not apply or there is none.',
      source: 'gias',
    },
    diocese: {
      type: 'string',
      placement: 'detail',
      label: 'Diocese',
      description: 'The Church of England or Roman Catholic diocese linked to the school. Not set for schools with no diocese.',
      source: 'gias',
    },
    faithSchool: {
      type: 'boolean',
      placement: 'mode',
      label: 'Faith school',
      description:
        'True if the register gives the school a religious character, or a religious ethos that names a faith (not "non-denominational"). False otherwise, including where the register is blank. Our grouping of the register, not an official label.',
      source: 'gias',
      nullable: false,
      default: false,
    },
  },

  async build(ctx) {
    const faith = await loadFaith(ctx.dataPath('gias'));
    const characters = ctx.read('gias-core');
    const rows = [];
    for (const urn of ctx.schools.urns) {
      const f = faith.get(urn);
      const character = (characters.get(urn)?.religion as string | null | undefined) ?? null;
      const isFaith = isFaithSchool(character, f?.ethos ?? null);
      if (!f && !isFaith) continue;
      rows.push({ urn, religiousEthos: f?.ethos ?? null, diocese: f?.diocese ?? null, faithSchool: isFaith });
    }
    ctx.log(`${rows.filter((r) => r.faithSchool).length} faith schools, ${rows.filter((r) => r.diocese).length} with a diocese`);
    return rows;
  },
});
