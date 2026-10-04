import { signed, type PopupSectionDef } from '../../web/toolkit.ts';
import { P8_ELEMENTS, P8_ELEMENT_LABELS, VA_AREAS, VA_LABELS } from './areas.ts';

const AXIS = 2; // chart axis runs from -2 to +2; scores beyond it are drawn at the end

export const popupSections: PopupSectionDef[] = [
  {
    id: 'subject-areas',
    group: 'results',
    order: 11, // directly after the Progress 8 section
    title: (p) => `By subject area (${p.subjectAreasYear ?? ''})`,
    render(p, h) {
      if (p.subjectAreasYear === null) return null;
      const chart = (name: string, value: number | null, lower: number | null, upper: number | null, suffix?: string) =>
        value === null || lower === null || upper === null
          ? null
          : h.html`<div class="ci-row"><div class="ci-head"><span>${name}</span><strong>${signed(value, 2)}</strong></div>${h.ciChart({
              value,
              lower,
              upper,
              min: -AXIS,
              max: AXIS,
              name: suffix ? `${name}, ${suffix}` : name,
              zeroLabel: '',
              compact: true,
            })}</div>`;

      const elements = P8_ELEMENTS.map((e) => chart(P8_ELEMENT_LABELS[e], p[`p8${e}`], p[`p8${e}Lower`], p[`p8${e}Upper`])).filter((c) => c !== null);
      const added = VA_AREAS.map((a) => chart(VA_LABELS[a], p[`va${a}`], p[`va${a}Lower`], p[`va${a}Upper`])).filter((c) => c !== null);
      if (elements.length === 0 && added.length === 0) return null;

      return h.html`<details class="subject-areas"><summary>Show progress by subject</summary>
        ${elements.length > 0 ? h.html`<p class="ci-group">Progress 8 elements</p>${elements}` : ''}
        ${added.length > 0 ? h.html`<p class="ci-group">Value added</p>${added}` : ''}
        ${h.note(
          'The dashed line is 0, the national average for pupils with the same starting point; the bar is the 95% confidence interval, so a bar that crosses the line is not clearly different from average. ' +
            'Progress 8 elements split the overall score into English, maths, EBacc subjects and other subjects. ' +
            'Value added is per pupil entered for science, humanities or languages GCSEs, so it covers fewer pupils. ' +
            'Progress 8 was not published after 2023/24.',
        )}
      </details>`;
    },
  },
];
