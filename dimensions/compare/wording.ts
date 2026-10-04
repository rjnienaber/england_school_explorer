// The words under each value in the comparison table. Pure code, so the claims can be tested.
//
// What a verdict may say depends on the measure (see GROUP_TITLES in measures.ts): "better progress" and "better
// results than expected for its intake" are claims about a school's effect, but "higher results" is only
// a statement about the pupils who sat the exams, and a Ofsted grade is an order, not a probability.

import type { MeasureDef } from './measures.ts';
import type { RowVerdict } from './stats.ts';

export type VerdictKind = 'best' | 'better' | 'worse' | 'mixed' | 'same';

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/** What to say about one school's value in a row, against the others in the row. Null if there is nobody to compare with. */
export function verdictText(m: MeasureDef, v: RowVerdict | null): { text: string; kind: VerdictKind } | null {
  if (!v || v.others === 0) return null;
  const lead = (s: string) => capital(m.ordinal ? s : `likely ${s}`);
  const lone = v.others === 1;
  if (v.best) return { text: `${lead(m.words.better)}${lone ? '' : ` than all ${v.others} others`}`, kind: 'best' };
  const parts: string[] = [];
  if (v.better > 0) parts.push(`${lead(m.words.better)}${lone ? '' : ` than ${v.better} of ${v.others}`}`);
  if (v.worse > 0) parts.push(`${parts.length ? `${m.ordinal ? '' : 'likely '}${m.words.worse}` : lead(m.words.worse)}${lone ? '' : ` than ${v.worse} of ${v.others}`}`);
  if (parts.length === 0) return { text: m.ordinal ? (lone ? 'Same grade' : 'Same grade as the others') : lone ? 'No clear difference' : 'No clear difference from the others', kind: 'same' };
  return { text: parts.join('; '), kind: v.better > 0 && v.worse > 0 ? 'mixed' : v.better > 0 ? 'better' : 'worse' };
}

/** The same verdict between two named schools, as a sentence for the head-to-head matrix. */
export function pairSentence(m: MeasureDef, a: string, b: string, prob: number | null, verdict: 'better' | 'same' | 'worse'): string {
  if (prob === null) {
    return verdict === 'same' ? `${a} and ${b} have the same grade.` : `${a} has ${verdict === 'better' ? m.words.better : m.words.worse} than ${b}: grades are ordered, so no probability applies.`;
  }
  const pct = Math.round(prob * 100);
  const label = verdict === 'better' ? `Likely ${m.words.better}` : verdict === 'worse' ? `Likely ${m.words.worse}` : 'No clear difference';
  const caveat = m.chanceOnly ? ' The odds allow only for chance variation, so they are firmer than the data really supports.' : '';
  return `${a} against ${b}: ${pct}% chance that ${a} is really higher on this measure${m.higherIsBetter ? '' : ' (lower is better here)'}. ${label}.${caveat}`;
}
