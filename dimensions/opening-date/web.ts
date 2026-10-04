import type { PopupSectionDef } from '../../web/toolkit.ts';
import { describeOpening } from './opening.ts';

// The popup has no hook for the grey line under the name, so this is an untitled line of its own
// (just after the urban/rural one). For a new school with no Attainment 8 score it also says why.
export const popupSections: PopupSectionDef[] = [
  {
    id: 'opening-date',
    order: 6,
    render: (p, h) => {
      const o = describeOpening(p.openDate, p.openReason, p.att8 !== null, new Date());
      if (!o) return null;
      return h.html`${h.meta(o.line)}${o.explainsNoResults ? h.note('New schools have no GCSE results until their first pupils reach Year 11, which is why none are shown.') : null}`;
    },
  },
];
