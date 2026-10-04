// When a school opened and why, from the GIAS register ("OpenDate" and "ReasonEstablishmentOpened").
// Explains why new schools have no results and why an Ofsted inspection may be of a predecessor.

import { defineDimension } from '../../lib/dimension.ts';
import { loadOpening } from './parse.ts';

export const module = defineDimension({
  id: 'opening-date',
  title: 'Opening date',
  dependsOn: ['gias-core'],
  fields: {
    openDate: {
      type: 'string',
      placement: 'detail',
      label: 'Opening date',
      description:
        'ISO date the school register gives as the opening date. For an academy conversion this is usually the date it became an academy, not when the school was first founded. Many older schools have no date.',
      source: 'gias',
    },
    openReason: {
      type: 'enum',
      values: ['new', 'academy', 'other'],
      placement: 'detail',
      label: 'Why the school opened',
      description:
        'Grouped from the register\'s "reason establishment opened": new (a new school or free school), academy (an existing school that converted to an academy) or other (amalgamation, fresh start, change of religious character and so on). Not set where the register gives no reason.',
      source: 'gias',
    },
  },

  async build(ctx) {
    const found = await loadOpening(ctx.dataPath('gias'));
    const rows = [];
    const counts = { new: 0, academy: 0, other: 0 };
    for (const urn of ctx.schools.urns) {
      const o = found.get(urn);
      if (!o) continue;
      if (o.reason) counts[o.reason]++;
      rows.push({ urn, openDate: o.date, openReason: o.reason });
    }
    ctx.log(`${rows.length} schools with an opening date or reason (${counts.new} new, ${counts.academy} academy conversions, ${counts.other} other)`);
    return rows;
  },
});
