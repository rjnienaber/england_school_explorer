// Collects what every dimension's web.ts contributes, sorted by `order`, for each phase. The list of
// modules comes from web/generated/registry.ts, which is generated from dimensions/*/.
//
// An item (mode, filter, popup section...) is in a phase when its own `phases` say so, or, if it has
// none, when its module's do. Ids only have to be unique within a phase, so a primary-only version of an
// item (such as the trust summary) can share an id with its secondary one.

import { DEFAULT_PHASE, type Phase } from '../lib/phase.ts';
import { webModules } from './generated/registry.ts';
import type { ExtensionDef, FilterDef, ModeDef, PhaseScoped, PopupRowDef, PopupSectionDef, PopupTagDef, SourceNoteDef } from './toolkit.ts';

export interface Registry {
  MODES: ModeDef[];
  FILTERS: FilterDef[];
  POPUP_SECTIONS: PopupSectionDef[];
  POPUP_ROWS: PopupRowDef[];
  POPUP_TAGS: PopupTagDef[];
  EXTENSIONS: ExtensionDef[];
  SOURCE_NOTES: SourceNoteDef[];
  /** The default mode is the one with the lowest `order`. */
  modeById: (id: string) => ModeDef;
}

function collect<T extends PhaseScoped & { id: string; order: number }>(
  kind: string,
  phase: Phase,
  pick: (m: (typeof webModules)[number]) => T[] | undefined,
): T[] {
  const all = webModules.flatMap((m) =>
    (pick(m) ?? []).filter((item) => (item.phases ?? m.phases).includes(phase)).map((item) => ({ item, module: m.id })),
  );
  const seen = new Map<string, string>();
  for (const { item, module } of all) {
    const prev = seen.get(item.id);
    if (prev) throw new Error(`${kind} id "${item.id}" is defined by both ${prev} and ${module} (for the ${phase} phase)`);
    seen.set(item.id, module);
  }
  return all.map((x) => x.item).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const cache = new Map<Phase, Registry>();

/** The modes, filters and popup pieces of one phase. */
export function registryFor(phase: Phase): Registry {
  let registry = cache.get(phase);
  if (!registry) {
    const MODES = collect('mode', phase, (m) => m.web.modes);
    registry = {
      MODES,
      FILTERS: collect('filter', phase, (m) => m.web.filters),
      POPUP_SECTIONS: collect('popup section', phase, (m) => m.web.popupSections),
      POPUP_ROWS: collect('popup row', phase, (m) => m.web.popupRows),
      POPUP_TAGS: collect('popup tag', phase, (m) => m.web.popupTags),
      EXTENSIONS: collect('extension', phase, (m) => m.web.extensions?.map((e) => ({ ...e, order: 0 }))),
      SOURCE_NOTES: collect('source note', phase, (m) => m.web.sourceNotes),
      modeById: (id) => MODES.find((m) => m.id === id) ?? MODES[0],
    };
    cache.set(phase, registry);
  }
  return registry;
}

// The secondary phase under the plain names: existing code and tests read these
const secondary = registryFor(DEFAULT_PHASE);
export const { MODES, FILTERS, POPUP_SECTIONS, POPUP_ROWS, POPUP_TAGS, EXTENSIONS, SOURCE_NOTES, modeById } = secondary;
