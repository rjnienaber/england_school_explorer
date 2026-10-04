import type { Phase, PopupSectionDef } from '../../web/toolkit.ts';
import { describeOpening } from './opening.ts';

// The popup has no hook for the grey line under the name, so this is an untitled line of its own
// (just after the urban/rural one). For a new school with no Attainment 8 score (or, for a primary, no KS2 result) it also says why.
const section = (phase: Phase): PopupSectionDef => ({
  phases: [phase],
  id: 'opening-date',
  order: 6,
  render: (p, h) => {
    const o = describeOpening(p.openDate, p.openReason, (phase === 'secondary' ? p.att8 : p.ks2RwmExpected) !== null, new Date());
    if (!o) return null;
    return h.html`${h.meta(o.line)}${o.explainsNoResults ? h.note(`New schools have no ${phase === 'secondary' ? 'GCSE' : 'KS2'} results until their first pupils reach Year ${phase === 'secondary' ? 11 : 6}, which is why none are shown.`) : null}`;
  },
});

export const popupSections: PopupSectionDef[] = [section('secondary'), section('primary')];
