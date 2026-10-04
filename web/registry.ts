// Collects what every dimension's web.ts contributes, sorted by `order`. The list of
// modules comes from web/generated/registry.ts, which is generated from dimensions/*/.

import { webModules } from './generated/registry.ts';
import type { ExtensionDef, FilterDef, ModeDef, PopupRowDef, PopupSectionDef, PopupTagDef, SourceNoteDef } from './toolkit.ts';

function collect<T extends { id: string; order: number }>(kind: string, pick: (m: (typeof webModules)[number]) => T[] | undefined): T[] {
  const all = webModules.flatMap((m) => (pick(m) ?? []).map((item) => ({ item, module: m.id })));
  const seen = new Map<string, string>();
  for (const { item, module } of all) {
    const prev = seen.get(item.id);
    if (prev) throw new Error(`${kind} id "${item.id}" is defined by both ${prev} and ${module}`);
    seen.set(item.id, module);
  }
  return all.map((x) => x.item).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export const MODES: ModeDef[] = collect('mode', (m) => m.web.modes);
export const FILTERS: FilterDef[] = collect('filter', (m) => m.web.filters);
export const POPUP_SECTIONS: PopupSectionDef[] = collect('popup section', (m) => m.web.popupSections);
export const POPUP_ROWS: PopupRowDef[] = collect('popup row', (m) => m.web.popupRows);
export const POPUP_TAGS: PopupTagDef[] = collect('popup tag', (m) => m.web.popupTags);
export const EXTENSIONS: ExtensionDef[] = collect('extension', (m) => m.web.extensions?.map((e) => ({ ...e, order: 0 })));
export const SOURCE_NOTES: SourceNoteDef[] = collect('source note', (m) => m.web.sourceNotes);

/** The default mode is the one with the lowest `order`. */
export const modeById = (id: string): ModeDef => MODES.find((m) => m.id === id) ?? MODES[0];
