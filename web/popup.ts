// The school detail popup: the school's name, basics and tags, then each dimension's
// popup sections in order. The sections themselves live in dimensions/*/web.ts.
//
// The popup is built from "pieces" (basics, tags, one per section). At build time each piece
// is run over every school to find which fields it reads (lib/trace-needs.ts), so while a
// piece's fields are still downloading it shows "Loading…" instead of wrong or missing data.

import { DEFAULT_PHASE, type Phase } from '../lib/phase.ts';
import { registryFor } from './registry.ts';
import { escapeHtml, h, html, POPUP_GROUPS, raw, type Html, type Metadata, type PopupGroupId, type School } from './toolkit.ts';

export interface PopupPiece {
  /** 'kind', 'place', 'tags' or 'section:<id>'. The key of `needs.popup`. */
  id: string;
  /** Null omits the piece. */
  html(p: School, meta?: Metadata): Html | null;
  /** Sections get a "Loading…" line while unready; the small header lines just wait. */
  isSection: boolean;
  /** Collapsible group a section belongs to (`group` of its PopupSectionDef). */
  group?: PopupGroupId;
  /** A section's title and body apart, for putting it inside a group. */
  parts?(p: School, meta?: Metadata): { title: string; body: Html } | null;
}

function describeSchool(p: School): string {
  const ages = p.ageLow !== null && p.ageHigh !== null ? `ages ${p.ageLow}–${p.ageHigh}` : null;
  const parts = [p.type, p.gender && p.gender !== 'Mixed' ? `${p.gender.toLowerCase()} only` : null, ages];
  return parts.filter(Boolean).map((s) => escapeHtml(s!)).join(' · ');
}

function tags(phase: Phase) {
  const { POPUP_TAGS } = registryFor(phase);
  return (p: School): Html => {
    const list = POPUP_TAGS.map((t) => t.tag(p)).filter((t) => t !== null);
    return html`<div class="tags">${list.map((t) => html`<span class="tag${t.warn ? ' warn' : ''}">${t.text}</span>`)}</div>`;
  };
}

function place(p: School): Html {
  const where = [p.town, p.postcode, p.la].filter(Boolean).map((s) => escapeHtml(s!)).join(', ');
  const website = p.website ? ` · <a href="${escapeHtml(p.website)}" target="_blank" rel="noopener">website</a>` : '';
  return raw(`<p class="meta">${where}${website}</p>`);
}

const cache = new Map<Phase, PopupPiece[]>();

/** The popup pieces of a phase: the header lines, then one per section that applies to it. */
export function piecesFor(phase: Phase): PopupPiece[] {
  let pieces = cache.get(phase);
  if (!pieces) {
    pieces = makePieces(phase);
    cache.set(phase, pieces);
  }
  return pieces;
}

export const PIECES: PopupPiece[] = piecesFor(DEFAULT_PHASE);

function makePieces(phase: Phase): PopupPiece[] {
  const { POPUP_ROWS, POPUP_SECTIONS } = registryFor(phase);
  return [
    { id: 'kind', isSection: false, html: (p) => raw(`<p class="meta">${describeSchool(p)}</p>`) },
    { id: 'place', isSection: false, html: place },
    { id: 'tags', isSection: false, html: tags(phase) },
    ...POPUP_SECTIONS.map((s) => {
      const parts = (p: School, meta?: Metadata): { title: string; body: Html } | null => {
        const extra = (slot?: string) =>
          POPUP_ROWS.filter((r) => r.section === s.id && r.slot === slot)
            .map((r) => r.row(p, h))
            .filter((r) => r !== null);
        const body = s.render(p, h, extra, meta);
        if (!body) return null;
        return { title: (typeof s.title === 'function' ? s.title(p) : s.title) ?? '', body };
      };
      return {
        id: `section:${s.id}`,
        isSection: true,
        group: s.group,
        parts,
        html(p: School, meta?: Metadata): Html | null {
          const part = parts(p, meta);
          if (!part) return null;
          return part.title ? html`<h4>${part.title}</h4>${part.body}` : part.body;
        },
      };
    }),
  ];
}

/**
 * One collapsible group. With a single section in it, that section's own title is the heading;
 * with several, the group's label is, and each section keeps its smaller title inside.
 */
function groupHtml(id: PopupGroupId, members: { title: string; body: Html }[]): string {
  const def: { label: string; open?: boolean } = POPUP_GROUPS[id];
  const single = members.length === 1;
  const heading = single && members[0].title ? members[0].title : def.label;
  const inner = members.map((m) => (single || !m.title ? m.body.value : `<h4>${escapeHtml(m.title)}</h4>${m.body.value}`));
  return `<details class="popup-group"${def.open ? ' open' : ''}><summary>${escapeHtml(heading)}</summary>${inner.join('')}</details>`;
}

export interface PopupState {
  /** Fields each piece reads (`needs.popup` from core.json). */
  needs: Record<string, string[]>;
  /** Is this field loaded for this school? */
  ready: (field: string) => boolean;
  /** Loading the missing fields failed. */
  failed?: boolean;
  /** Dataset-level values (national medians and so on), handed to `render` as its last argument. */
  metadata?: Metadata;
  /** The phase whose sections to show. Default secondary. */
  phase?: Phase;
}

export function popupHtml(p: School, state: PopupState): string {
  const out: (string | { group: PopupGroupId })[] = [];
  const groups = new Map<PopupGroupId, { title: string; body: Html }[]>();
  let waiting = false;
  for (const piece of piecesFor(state.phase ?? DEFAULT_PHASE)) {
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
    if (piece.group && piece.parts) {
      const part = piece.parts(p, state.metadata);
      if (!part) continue;
      // The group sits where its first section would
      if (!groups.has(piece.group)) {
        groups.set(piece.group, []);
        out.push({ group: piece.group });
      }
      groups.get(piece.group)!.push(part);
      continue;
    }
    const body = piece.html(p, state.metadata);
    if (body) out.push(body.value);
  }
  const rendered = out.map((o) => (typeof o === 'string' ? o : groupHtml(o.group, groups.get(o.group)!)));
  return `
    <div class="school-popup">
      <h3>${escapeHtml(p.name)}</h3>
      ${rendered.join('\n      ')}
    </div>`;
}
