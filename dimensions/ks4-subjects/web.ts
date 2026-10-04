import type { FilterDef, Metadata, PopupSectionDef, SourceNoteDef } from '../../web/toolkit.ts';
import { decodeEntries, SUBJECT_BY_CODE, SUBJECTS } from './subjects.ts';

const year = (meta: Metadata) => (meta.subjectsYear as string | null | undefined) ?? null;
const lookup = (meta: Metadata | undefined, key: string): Record<string, number> => (meta?.[key] as Record<string, number> | null | undefined) ?? {};

/** Subject choices for the "Offers GCSE" filter: LANG is any language, the rest are one subject (codes in subjects.ts). */
const OPTIONS: [string, string][] = [
  ['LANG', 'Any language'],
  ['FRE', 'French'],
  ['SPA', 'Spanish'],
  ['GER', 'German'],
  ['LAT', 'Latin'],
  ['ITA', 'Italian'],
  ['CHI', 'Chinese'],
  ['CS', 'Computer science'],
  ['STA', 'Statistics'],
  ['FM', 'Further maths (Level 3)'],
  ['MUS', 'Music'],
  ['DRA', 'Drama'],
  ['ART', 'Art and design'],
];

export const filters: FilterDef[] = [
  {
    id: 'offersSubject',
    order: 105,
    control: { kind: 'select', label: 'Offers GCSE', options: [{ value: '', label: 'Any subject' }, ...OPTIONS.map(([value, label]) => ({ value, label }))] },
    default: '',
    // Schools with no subject figures are hidden while a subject is picked: we can't say they offer it
    test: (p, value) => !value || (p.subjectsOffered !== null && p.subjectsOffered.split(',').includes(value)),
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'subjects',
    order: 26,
    title: (p) => `Subjects${p.subjectsYear ? ` (${p.subjectsYear})` : ''}`,
    render(p, h, _extra, meta) {
      const entries = decodeEntries(p.subjectEntries);
      if (entries.size === 0) return null;
      const offered = SUBJECTS.filter((s) => entries.has(s.code));
      const typical = lookup(meta, 'subjectsTypicalPct');
      const offeredBy = lookup(meta, 'subjectsOfferedByPct');
      const percent = (n: number | undefined) => (n === undefined ? null : `${n}%`);
      const chips = offered.map((s) => h.html`<span class="tag">${s.label}</span>`);
      const notEntered = SUBJECTS.filter((s) => !s.language && !entries.has(s.code)).map((s) => SUBJECT_BY_CODE.get(s.code)!.label.replace(/ \(.*\)/, ''));
      return h.html`<div class="tags">${chips}</div>${h.table(
        ['Share of year group entered', 'This school', 'Typical school offering it', 'Schools offering it'],
        offered.map((s) => [s.label, `${entries.get(s.code)}%`, percent(typical[s.code]), percent(offeredBy[s.code])]),
      )}${notEntered.length ? h.note(`Not entered: ${notEntered.join(', ').toLowerCase()}.`) : null}${h.note('Pupils entered for the GCSE, not necessarily passed; a pupil taking a subject early or again can push a share up (it stops at 100%). Only the main subjects are listed. Typical is the median state school that enters the subject at all. Further maths is the Level 3 free-standing maths qualification, as there is no GCSE in it. A suppressed count is left out.')}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'ks4-subjects',
    order: 15,
    about: (meta, h) => h.html`${h.sourceLink('ks4-subjects', 'DfE Key stage 4 performance, subject entries')}${year(meta) ? h.html` (${year(meta)})` : ''}`,
    dates: (meta) => [year(meta) && `GCSE subjects ${year(meta)}`],
  },
];
