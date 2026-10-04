// The school detail popup: the school's name, basics and tags, then each dimension's
// popup sections in order. The sections themselves live in dimensions/*/web.ts.

import { POPUP_ROWS, POPUP_SECTIONS, POPUP_TAGS } from './registry.ts';
import { escapeHtml, h, html, type Html, type School } from './toolkit.ts';

function describeSchool(p: School): string {
  const ages = p.ageLow !== null && p.ageHigh !== null ? `ages ${p.ageLow}–${p.ageHigh}` : null;
  const parts = [p.type, p.gender && p.gender !== 'Mixed' ? `${p.gender.toLowerCase()} only` : null, ages];
  return parts.filter(Boolean).map((s) => escapeHtml(s!)).join(' · ');
}

function tags(p: School): Html {
  const list = POPUP_TAGS.map((t) => t.tag(p)).filter((t) => t !== null);
  return html`<div class="tags">${list.map((t) => html`<span class="tag${t.warn ? ' warn' : ''}">${t.text}</span>`)}</div>`;
}

function sections(p: School): Html[] {
  return POPUP_SECTIONS.flatMap((s) => {
    const extra = (slot?: string) =>
      POPUP_ROWS.filter((r) => r.section === s.id && r.slot === slot)
        .map((r) => r.row(p, h))
        .filter((r) => r !== null);
    const body = s.render(p, h, extra);
    if (!body) return [];
    const title = typeof s.title === 'function' ? s.title(p) : s.title;
    return [title ? html`<h4>${title}</h4>${body}` : body];
  });
}

export function popupHtml(p: School): string {
  const place = [p.town, p.postcode, p.la].filter(Boolean).map((s) => escapeHtml(s!)).join(', ');
  const website = p.website ? ` · <a href="${escapeHtml(p.website)}" target="_blank" rel="noopener">website</a>` : '';
  return `
    <div class="school-popup">
      <h3>${escapeHtml(p.name)}</h3>
      <p class="meta">${describeSchool(p)}</p>
      <p class="meta">${place}${website}</p>
      ${tags(p).value}
      ${sections(p).map((s) => s.value).join('\n      ')}
    </div>`;
}
