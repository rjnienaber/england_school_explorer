// Disadvantaged pupils' GCSE results and the gap to other pupils. It adds to ks4-headline, which
// keeps the share of disadvantaged pupils (disadvantagedPct) and their Attainment 8
// (att8Disadvantaged); this module takes over showing them in the popup, and uses the same year.

import { defineDimension } from '../../lib/dimension.ts';
import { MIN_DISADVANTAGED_PUPILS } from './constants.ts';
import { loadDisadvantage } from './parse.ts';

export const module = defineDimension({
  id: 'ks4-disadvantaged',
  title: 'Disadvantaged pupils (KS4)',
  dependsOn: ['gias-core', 'ks4-headline'],
  fields: {
    disadvantagedYear: {
      type: 'string',
      placement: 'detail',
      label: 'Disadvantaged pupils results year',
      description: 'Same year as the headline GCSE results',
      source: 'ks4',
    },
    disadvantagedCount: {
      type: 'number',
      placement: 'detail',
      label: 'Disadvantaged pupils in year group',
      description: 'Pupils eligible for free school meals at any time in the last 6 years, or looked after by a local authority',
      source: 'ks4',
      year: 'disadvantagedYear',
    },
    att8NotDisadvantaged: {
      type: 'number',
      placement: 'detail',
      label: 'Attainment 8 of pupils not known to be disadvantaged',
      source: 'ks4',
      year: 'disadvantagedYear',
    },
    disadvantageGap: {
      type: 'number',
      decimals: 1,
      placement: 'detail',
      label: 'Disadvantage gap in Attainment 8',
      description: `Disadvantaged pupils' Attainment 8 minus other pupils' (usually negative). Only when both groups have at least ${MIN_DISADVANTAGED_PUPILS} pupils. A small gap can just mean other pupils do badly, so it is context, not a measure of quality`,
      source: 'ks4',
      year: 'disadvantagedYear',
    },
    att8DisadvantagedPct: {
      type: 'number',
      placement: 'mode',
      label: 'Disadvantaged pupils Attainment 8 percentile',
      description: `Percentile (0-100) of disadvantaged pupils' Attainment 8 among state-funded mainstream schools in the same year with at least ${MIN_DISADVANTAGED_PUPILS} disadvantaged pupils. Our own ranking, not an official measure`,
      source: 'ks4',
      year: 'disadvantagedYear',
    },
  },

  async build(ctx) {
    const disadvantage = await loadDisadvantage(ctx.dataPath('ks4'));
    const headline = ctx.read('ks4-headline');

    // Each school uses the headline year (its latest with an Attainment 8 score), so the figures
    // sit alongside the school's own results and the existing disadvantaged values.
    const pairsByYear = new Map<string, [number, number][]>();
    const candidates: { urn: number; label: string; att8: number | null; count: number | null; notAtt8: number | null; notCount: number | null }[] = [];
    for (const { urn } of ctx.schools.all) {
      const label = headline.get(urn)?.ks4Year;
      if (typeof label !== 'string') continue;
      const y = disadvantage.get(urn)?.get(label);
      if (!y) continue;
      candidates.push({ urn, label, att8: y.disadvantagedAtt8, count: y.disadvantagedCount, notAtt8: y.notDisadvantagedAtt8, notCount: y.notDisadvantagedCount });
      if (y.disadvantagedAtt8 !== null && (y.disadvantagedCount ?? 0) >= MIN_DISADVANTAGED_PUPILS) {
        if (!pairsByYear.has(label)) pairsByYear.set(label, []);
        pairsByYear.get(label)!.push([urn, y.disadvantagedAtt8]);
      }
    }
    const rankers = new Map([...pairsByYear].map(([label, pairs]) => [label, ctx.stats.percentileAmongState(pairs)]));

    const rows = [];
    for (const c of candidates) {
      if (c.att8 === null && c.notAtt8 === null && c.count === null) continue;
      const ranked = c.att8 !== null && (c.count ?? 0) >= MIN_DISADVANTAGED_PUPILS;
      const gapOk = ranked && c.notAtt8 !== null && (c.notCount ?? 0) >= MIN_DISADVANTAGED_PUPILS;
      rows.push({
        urn: c.urn,
        disadvantagedYear: c.label,
        disadvantagedCount: c.count,
        att8NotDisadvantaged: c.notAtt8,
        disadvantageGap: gapOk ? c.att8! - c.notAtt8! : null,
        att8DisadvantagedPct: ranked && ctx.schools.isState(c.urn) ? rankers.get(c.label)!(c.att8!) : null,
      });
    }

    ctx.log(`${rows.length} schools with disadvantaged results; ${rows.filter((r) => r.att8DisadvantagedPct !== null).length} ranked`);
    return rows;
  },
});
