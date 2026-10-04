import { P8_LABELS } from '../ks4-headline/bands.ts';
import { PRIOR_EXPLANATIONS, PRIOR_GROUPS, PRIOR_LABELS } from './groups.ts';
import { fmt, signed, type PopupSectionDef } from '../../web/toolkit.ts';

export const popupSections: PopupSectionDef[] = [
  {
    id: 'prior-attainment',
    order: 25, // after the GCSE results table
    title: (p) => `Results by starting point (${p.priorYear ?? ''})`,
    render(p, h) {
      const rows = PRIOR_GROUPS.map((g) => {
        const att8 = p[`prior${g}Att8`];
        const p8 = p[`prior${g}P8`];
        const band = p[`prior${g}P8Band`];
        if (att8 === null && p8 === null) return null; // no pupils in this group, or suppressed
        return [
          PRIOR_LABELS[g],
          fmt(p[`prior${g}Pct`], 0, '%'),
          fmt(att8),
          p8 === null ? null : h.html`${signed(p8, 2)}${band ? h.html`<br><span class="muted">${P8_LABELS[band]}</span>` : ''}`,
        ];
      });
      if (rows.every((r) => r === null)) return null;
      return h.html`${h.table(['Starting point', 'Pupils', 'Attain. 8', 'Progress 8'], rows)}${h.note(
        'Pupils are grouped by their reading and maths results at the end of primary school (key stage 2): ' +
          PRIOR_GROUPS.map((g) => `${PRIOR_LABELS[g].toLowerCase()} is ${PRIOR_EXPLANATIONS[g]}`).join(', ') +
          '. ' +
          'This needs those results, so it can be an older year than the GCSE results above. ' +
          'Small groups swing a lot: a band is only above or below average when the whole confidence interval is.',
      )}`;
    },
  },
];
