// The school detail popup: the school's name, basics and tags, then each dimension's
// popup sections in order. The sections themselves live in dimensions/*/web.ts.
//
// The popup is built from "pieces" (basics, tags, one per section). At build time each piece
// is run over every school to find which fields it reads (lib/trace-needs.ts), so while a
// piece's fields are still downloading it shows "Loading…" instead of wrong or missing data.

import { POPUP_ROWS, POPUP_SECTIONS, POPUP_TAGS } from './registry.ts';
import { escapeHtml, h, html, raw, type Html, type Metadata, type School } from './toolkit.ts';

export interface PopupPiece {
  /** 'kind', 'place', 'tags' or 'section:<id>'. The key of `needs.popup`. */
  id: string;
  /** Null omits the piece. */
  html(p: School, meta?: Metadata): Html | null;
  /** Sections get a "Loading…" line while unready; the small header lines just wait. */
  isSection: boolean;
}

function describeSchool(p: School): string {
  const ages = p.ageLow !== null && p.ageHigh !== null ? `ages ${p.ageLow}–${p.ageHigh}` : null;
  const parts = [p.type, p.gender && p.gender !== 'Mixed' ? `${p.gender.toLowerCase()} only` : null, ages];
  return parts.filter(Boolean).map((s) => escapeHtml(s!)).join(' · ');
}

function tags(p: School): Html {
  const list = POPUP_TAGS.map((t) => t.tag(p)).filter((t) => t !== null);
  return html`<div class="tags">${list.map((t) => html`<span class="tag${t.warn ? ' warn' : ''}">${t.text}</span>`)}</div>`;
}

function place(p: School): Html {
  const where = [p.town, p.postcode, p.la].filter(Boolean).map((s) => escapeHtml(s!)).join(', ');
  const website = p.website ? ` · <a href="${escapeHtml(p.website)}" target="_blank" rel="noopener">website</a>` : '';
  return raw(`<p class="meta">${where}${website}</p>`);
}

export const PIECES: PopupPiece[] = [
  { id: 'kind', isSection: false, html: (p) => raw(`<p class="meta">${describeSchool(p)}</p>`) },
  { id: 'place', isSection: false, html: place },
  { id: 'tags', isSection: false, html: tags },
  ...POPUP_SECTIONS.map((s) => ({
    id: `section:${s.id}`,
    isSection: true,
    html(p: School, meta?: Metadata): Html | null {
      const extra = (slot?: string) =>
        POPUP_ROWS.filter((r) => r.section === s.id && r.slot === slot)
          .map((r) => r.row(p, h))
          .filter((r) => r !== null);
      const body = s.render(p, h, extra, meta);
      if (!body) return null;
      const title = typeof s.title === 'function' ? s.title(p) : s.title;
      return title ? html`<h4>${title}</h4>${body}` : body;
    },
  })),
];

export interface PopupState {
  /** Fields each piece reads (`needs.popup` from core.json). */
  needs: Record<string, string[]>;
  /** Is this field loaded for this school? */
  ready: (field: string) => boolean;
  /** Loading the missing fields failed. */
  failed?: boolean;
  /** Dataset-level values (national medians and so on), handed to `render` as its last argument. */
  metadata?: Metadata;
}

export function popupHtml(p: School, state: PopupState): string {
  const out: string[] = [];
  let waiting = false;
  for (const piece of PIECES) {
    if (!(state.needs[piece.id] ?? []).every(state.ready)) {
      if (piece.isSection && !waiting) {
        waiting = true;
        out.push(
          state.failed
            ? '<p class="note">Couldn’t load the rest of the details. Check your connection and try again.</p>'
            : '<p class="meta loading-note" role="status">Loading…</p>',
        );
      }
      continue;
    }
    const body = piece.html(p, state.metadata);
    if (body) out.push(body.value);
  }
  return `
    <div class="school-popup">
      <h3>${escapeHtml(p.name)}</h3>
      ${out.join('\n      ')}
    </div>`;
}
