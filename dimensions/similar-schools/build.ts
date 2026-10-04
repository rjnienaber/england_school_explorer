// Similar schools: for each state-funded school, the 20 schools with the most similar intake (see
// model.ts), and where the school stands among them. Our own grouping, not an official one. Schools
// missing any intake figure, and independent schools, get no group and are never in anyone else's.

import { defineDimension } from '../../lib/dimension.ts';
import { SIMILAR_COUNT, findSimilar, type Candidate } from './model.ts';
import { rankAmong } from './shared.ts';

const number = (v: unknown) => (typeof v === 'number' ? v : null);

const rank = (what: string) => ({
  type: 'number' as const,
  placement: 'detail' as const,
  decimals: 0,
  label: what,
  year: 'ks4Year',
});

export const module = defineDimension({
  id: 'similar-schools',
  title: 'Similar schools (our own grouping)',
  dependsOn: ['gias-core', 'ks4-headline', 'census', 'ks4-prior-attainment', 'urban-rural', 'absence'],
  fields: {
    similarUrns: {
      type: 'string',
      placement: 'detail',
      label: 'Similar schools (URNs)',
      description:
        `The ${SIMILAR_COUNT} state-funded schools with the most similar intake, nearest first, as URNs joined by "-". Our own grouping, not an official one: ` +
        'the same kind of school (selective or not; boys, girls or mixed) and closest on the share of disadvantaged pupils, English as an additional language, ' +
        'low and high prior attainers, size, and urban or rural. Missing for independent schools and schools without all of those figures',
    },
    similarAtt8Rank: {
      ...rank('Attainment 8 place among similar schools'),
      description: 'Place (1 = highest Attainment 8) among the school and its similar schools that have a score. Our own grouping',
    },
    similarAtt8Of: {
      ...rank('Similar schools with an Attainment 8 score'),
      description: 'How many schools (the school itself included) similarAtt8Rank is out of',
    },
    similarAbsenceRank: {
      ...rank('Persistent absence place among similar schools'),
      description: 'Place (1 = lowest persistent absence) among the school and its similar schools that have a figure. Our own grouping',
    },
    similarAbsenceOf: {
      ...rank('Similar schools with a persistent absence figure'),
      description: 'How many schools (the school itself included) similarAbsenceRank is out of',
    },
  },

  build(ctx) {
    const gias = ctx.read('gias-core');
    const headline = ctx.read('ks4-headline');
    const census = ctx.read('census');
    const prior = ctx.read('ks4-prior-attainment');
    const area = ctx.read('urban-rural');
    const absence = ctx.read('absence');

    let state = 0;
    const missing = { disadvantaged: 0, eal: 0, prior: 0, pupils: 0, area: 0 };
    const candidates: Candidate[] = [];
    for (const s of ctx.schools.all) {
      if (!ctx.schools.isState(s.urn)) continue;
      state++;
      const g = gias.get(s.urn);
      const disadvantagedPct = number(headline.get(s.urn)?.disadvantagedPct);
      const ealPct = number(census.get(s.urn)?.ealPctAll);
      const priorLowPct = number(prior.get(s.urn)?.priorLowPct);
      const priorHighPct = number(prior.get(s.urn)?.priorHighPct);
      const pupils = number(g?.pupils);
      const urbanRural = area.get(s.urn)?.urbanRural;
      if (disadvantagedPct === null) missing.disadvantaged++;
      if (ealPct === null) missing.eal++;
      if (priorLowPct === null || priorHighPct === null) missing.prior++;
      if (pupils === null || pupils <= 0) missing.pupils++;
      if (!urbanRural) missing.area++;
      if (
        disadvantagedPct === null || ealPct === null || priorLowPct === null || priorHighPct === null ||
        pupils === null || pupils <= 0 || typeof g?.gender !== 'string' || !urbanRural
      ) {
        continue;
      }
      candidates.push({
        urn: s.urn,
        selective: s.selective,
        gender: g.gender,
        disadvantagedPct,
        ealPct,
        priorLowPct,
        priorHighPct,
        pupils,
        rural: urbanRural === 'rural',
      });
    }
    ctx.log(
      `${candidates.length} of ${state} state schools have every intake figure ` +
        `(missing: ${Object.entries(missing).map(([k, n]) => `${n} ${k}`).join(', ')})`,
    );

    const similar = findSimilar(candidates);
    const att8 = (urn: number) => number(headline.get(urn)?.att8);
    const persistent = (urn: number) => number(absence.get(urn)?.absencePersistentPct);

    const rows = [...similar].map(([urn, others]) => {
      const row: Record<string, number | string> & { urn: number } = { urn, similarUrns: others.join('-') };
      const a = att8(urn);
      if (a !== null) {
        const r = rankAmong(a, others.map(att8), true);
        row.similarAtt8Rank = r.rank;
        row.similarAtt8Of = r.of;
      }
      const p = persistent(urn);
      if (p !== null) {
        const r = rankAmong(p, others.map(persistent), false);
        row.similarAbsenceRank = r.rank;
        row.similarAbsenceOf = r.of;
      }
      return row;
    });
    const sizes = [...similar.values()].map((u) => u.length);
    ctx.log(`${rows.length} schools grouped, ${Math.min(...sizes)} to ${Math.max(...sizes)} similar schools each`);
    return rows;
  },
});
