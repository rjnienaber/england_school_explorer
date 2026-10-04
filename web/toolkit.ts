// What a dimension's web.ts imports: the types it fills in and small helpers. Also exports
// the helper object `h` that the popup framework passes to `render`.
//
// A web.ts may export any of: modes, filters, popupSections, popupRows, popupTags, sourceNotes.

import type { SchoolRecord, Metadata } from './types.ts';
import type { PaletteName } from './palette.ts';
import type { SchoolData } from './data.ts';
import type { Phase } from '../lib/phase.ts';

export type { Metadata, PaletteName, Phase, SchoolRecord };

/**
 * Every mode, filter, popup section, row, tag, source note and extension may set `phases` to narrow where it
 * appears. Left out, it follows its module's `phases` (build.ts), which default to secondary only.
 */
export interface PhaseScoped {
  phases?: readonly Phase[];
}
/** One school's properties, typed from the field declarations. */
export type School = SchoolRecord;

// ---------- Colour modes ----------

export interface Bucket {
  label: string;
  /** Index into the mode's palette (0-4). 4 is best / highest. -2 draws a solid neutral dot for "does not apply" (such as no sixth form), unlike the hollow ring of "No data". */
  colour: number;
}

export interface ModeDef extends PhaseScoped {
  /** Unique across modules. */
  id: string;
  /** Button text and list heading ("Schools in view by <label>"). */
  label: string;
  /** Position among modes. The lowest is the default mode. Leave gaps (10, 20, ...). */
  order: number;
  description: string | ((meta: Metadata) => string);
  /** 'diverging' (default) for measures with a good and a bad end; 'sequential' otherwise. */
  palette?: PaletteName;
  /** Legend order: best / highest first. */
  buckets: Bucket[];
  /** Which bucket a school falls into, or null if it has no value. */
  bucketOf: (p: School) => number | null;
  /** Numeric value to rank schools by in the list (higher first). */
  sortValue: (p: School) => number | null;
  /** Short value shown in the list and hover tip. */
  formatValue: (p: School) => string;
}

export const QUINTILES: Bucket[] = [
  { label: 'Top 20%', colour: 4 },
  { label: '60–80th percentile', colour: 3 },
  { label: '40–60th percentile', colour: 2 },
  { label: '20–40th percentile', colour: 1 },
  { label: 'Bottom 20%', colour: 0 },
];

/** Bucket index (into QUINTILES) for a 0-100 percentile. */
export const quintile = (pct: number | null) => (pct === null ? null : 4 - Math.min(4, Math.floor(pct / 20)));

// ---------- Filters ----------

/** Collapsible sections of the "Show" list. A section opens by itself when one of its filters is in use. */
export const FILTER_GROUPS = {
  type: { label: 'Type of school', open: true },
  subjects: { label: 'Subjects offered' },
  area: { label: 'Area' },
  send: { label: 'Special educational needs' },
} satisfies Record<string, { label: string; open?: boolean }>;
export type FilterGroupId = keyof typeof FILTER_GROUPS;

interface FilterBase extends PhaseScoped {
  /** Unique across modules. Also the key the value is saved under in localStorage. */
  id: string;
  /** Position in the "Show" list. */
  order: number;
  /**
   * Id of a checkbox filter this one depends on (for example a "Type of need" select under a
   * "Has an SEN unit" checkbox). While that checkbox is off the control is greyed out and the
   * filter is ignored (`test` is not called, and its columns are not loaded). The saved value is
   * kept, so ticking the checkbox again brings it back. Give it a higher `order` than its parent
   * so it appears underneath.
   */
  enabledBy?: string;
  /** Collapsible section of the "Show" list this control goes in (a key of `FILTER_GROUPS`). Omit for the ungrouped top. */
  group?: FilterGroupId;
}

export interface CheckboxFilter extends FilterBase {
  control: { kind: 'checkbox'; label: string };
  default: boolean;
  /** True to keep the school on the map. */
  test: (p: School, value: boolean) => boolean;
}

export interface SelectFilter extends FilterBase {
  control: { kind: 'select'; label: string; options: { value: string; label: string }[] };
  /** One of the option values. */
  default: string;
  test: (p: School, value: string) => boolean;
}

/**
 * A "focus" filter: a set of schools picked from somewhere else (a button in a popup, or a link such as
 * `?trust=17396`) rather than from a control in the "Show" list. While its value is not '' the map shows only
 * the schools whose `test` passes, fits to them, and the panel shows a chip ("Trust: X ✕") that clears it,
 * with an optional summary underneath. It is not saved in localStorage (the URL carries it: `?<id>=<value>`).
 *
 * Open one from a popup with `h.filterButton(id, value, label)`. Use it for any "these schools" view: a trust, a
 * shortlist to compare, the schools like this one.
 *
 * `chipText` and `summary` get every school that passes `test` (not narrowed by the other filters), and their
 * field reads are traced like a filter's, so those fields are loaded when the chip is set. The build also runs them
 * with a single school, so they must cope with that.
 */
export interface ChipFilter extends FilterBase {
  control: {
    kind: 'chip';
    /** Chip prefix: "Trust" gives "Trust: <chipText>". */
    label: string;
    /** The rest of the chip: usually a name. `schools` are the matching schools, `value` the filter value. */
    chipText: (schools: School[], value: string) => string;
    /** Optional block under the chip. Return null for nothing. */
    summary?: (schools: School[], value: string, h: Helpers, meta?: Metadata) => Html | null;
  };
  /** Always '' (no focus). */
  default: '';
  /** True to keep the school. Called with '' when the focus is off, and must keep everything then (without reading any field). */
  test: (p: School, value: string) => boolean;
}

export type FilterDef = CheckboxFilter | SelectFilter | ChipFilter;

// ---------- Popup ----------

/** HTML that is safe to insert as-is. Build it with `html` or `raw`, never from a plain string. */
export class Html {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export type Interpolable = Html | string | number | boolean | null | undefined | Interpolable[];

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

function render(value: Interpolable): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false || value === true) return '';
  return escapeHtml(String(value));
}

/** Marks a string you have already made safe (e.g. static markup) as HTML. */
export const raw = (s: string) => new Html(s);

/**
 * Template tag that escapes everything interpolated into it, unless it is already `Html`.
 * html`<b>${school.name}</b>` is safe whatever the name contains.
 */
export function html(strings: TemplateStringsArray, ...values: Interpolable[]): Html {
  return new Html(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));
}

export const fmt = (n: number | null | undefined, places = 1, suffix = '') => (n == null ? '–' : n.toFixed(places) + suffix);
export const signed = (n: number | null | undefined, places: number) =>
  n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(places);

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** "12 Mar 2024", with "(3 years ago)" appended once it is two or more years old. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const years = (Date.now() - date.getTime()) / (365.25 * 86_400_000);
  const when = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return years >= 2 ? `${when} (${Math.floor(years)} years ago)` : when;
}

export type RowValue = Interpolable;
export type RowEntry = readonly [label: string, value: RowValue];

/** A two-column table of label and value. Falsy entries are skipped; a null value shows "–". Everything is escaped. */
export function rows(entries: (RowEntry | null | false | undefined)[]): Html {
  const body = entries
    .filter((e): e is RowEntry => !!e)
    .map(([label, value]) => html`<tr><th>${label}</th><td>${value === null || value === undefined ? '–' : value}</td></tr>`);
  return html`<table class="stats">${body}</table>`;
}

/**
 * A table with a heading row: the first cell of each row is its label, the rest are right-aligned values.
 * Use it when `rows` (label and one value) is too narrow. Falsy rows are skipped; a null cell shows "–".
 */
export function table(head: Interpolable[], entries: (Interpolable[] | null | false | undefined)[]): Html {
  const body = entries
    .filter((e): e is Interpolable[] => !!e)
    .map(([label, ...cells]) => html`<tr><th>${label}</th>${cells.map((c) => html`<td>${c === null || c === undefined ? '–' : c}</td>`)}</tr>`);
  const [corner, ...columns] = head;
  return html`<table class="stats grid"><thead><tr><th>${corner}</th>${columns.map((c) => html`<th>${c}</th>`)}</tr></thead><tbody>${body}</tbody></table>`;
}

/** A muted explanatory paragraph. */
export const note = (text: Interpolable) => html`<p class="note">${text}</p>`;
/** A small grey line (dates, links). */
export const meta = (text: Interpolable) => html`<p class="meta">${text}</p>`;
/** An external link that opens in a new tab. */
export const link = (url: string, label: Interpolable) => html`<a href="${url}" target="_blank" rel="noopener">${label}</a>`;

export interface CiChartOptions {
  value: number;
  lower: number;
  upper: number;
  /** Axis ends; values outside are clamped to them. */
  min: number;
  max: number;
  /** For the screen-reader label, e.g. "Progress 8". */
  name: string;
  /** Label under the zero line. */
  zeroLabel: string;
  decimals?: number;
  /** A shorter chart with no axis labels, for several in a row (the line's meaning goes in a note). */
  compact?: boolean;
}

/** A value with its 95% confidence interval as a small SVG range chart. */
export function ciChart(o: CiChartOptions): Html {
  const d = o.decimals ?? 2;
  const x = (v: number) => 4 + ((Math.max(o.min, Math.min(o.max, v)) - o.min) / (o.max - o.min)) * 252;
  const label = `${o.name} ${signed(o.value, d)}, 95% confidence interval ${signed(o.lower, d)} to ${signed(o.upper, d)}`;
  if (o.compact) {
    return html`
    <svg class="ci-chart compact" viewBox="0 0 260 20" role="img" aria-label="${label}">
      <line class="axis" x1="4" x2="256" y1="10" y2="10" />
      <line class="zero" x1="${x(0)}" x2="${x(0)}" y1="2" y2="18" />
      <line class="range" x1="${x(o.lower)}" x2="${x(o.upper)}" y1="10" y2="10" />
      <circle class="point" cx="${x(o.value)}" cy="10" r="3.5" />
    </svg>`;
  }
  return html`
    <svg class="ci-chart" viewBox="0 0 260 34" role="img" aria-label="${label}">
      <line class="axis" x1="4" x2="256" y1="14" y2="14" />
      <line class="zero" x1="${x(0)}" x2="${x(0)}" y1="4" y2="24" />
      <line class="range" x1="${x(o.lower)}" x2="${x(o.upper)}" y1="14" y2="14" />
      <circle class="point" cx="${x(o.value)}" cy="14" r="4" />
      <text x="4" y="32">${signed(o.min, 1)}</text>
      <text x="${x(0)}" y="32" text-anchor="middle">${o.zeroLabel}</text>
      <text x="256" y="32" text-anchor="end">${signed(o.max, 1)}</text>
    </svg>`;
}

/**
 * A button that sets a focus filter (see `ChipFilter`) to `value`: clicking it closes the popup, filters the map
 * to those schools and fits the map to them. Looks like a link.
 */
export const filterButton = (filterId: string, value: string, label: Interpolable) =>
  html`<button type="button" class="link-button" data-set-filter="${filterId}" data-value="${value}">${label}</button>`;

/** Median of the numbers, or null if there are none. */
export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** The helpers handed to `render` and the source-note callbacks. */
export const h = { html, raw, rows, table, note, meta, link, ciChart, filterButton, escapeHtml, fmt, signed, ordinal, formatDate };
export type Helpers = typeof h;

/**
 * Collapsible groups of popup sections, in the order their first section appears. A group holding one section
 * uses that section's own title as its heading; with several, the label below is the heading.
 */
export const POPUP_GROUPS = {
  results: { label: 'Results', open: true },
  subjects: { label: 'Curriculum and subjects' },
  conduct: { label: 'Attendance and behaviour' },
  after: { label: 'After GCSEs' },
  pupils: { label: 'Pupils and staff' },
  funding: { label: 'Funding' },
  similar: { label: 'Similar schools' },
} satisfies Record<string, { label: string; open?: boolean }>;
export type PopupGroupId = keyof typeof POPUP_GROUPS;

export interface PopupSectionDef extends PhaseScoped {
  /** Unique across modules. */
  id: string;
  /** Collapsible group this section goes in (a key of `POPUP_GROUPS`). Omit to leave it always visible. */
  group?: PopupGroupId;
  /** Position in the popup, below the school's name and tags. */
  order: number;
  /** Heading above the section. Omit for none. */
  title?: string | ((p: School) => string);
  /**
   * The section's body, or null to leave the whole section out (title included).
   * `extra(slot?)` returns the rows other modules contributed to this section with
   * `popupRows` (those aimed at `slot`, or the unslotted ones), already sorted. `meta` is the dataset-level
   * metadata (national medians and so on); it is missing while the build traces which fields a section reads,
   * so treat it as optional.
   */
  render: (p: School, h: Helpers, extra: (slot?: string) => RowEntry[], meta?: Metadata) => Html | null;
}

/** A row a module adds to another module's popup section, e.g. a new line in the GCSE results table. */
export interface PopupRowDef extends PhaseScoped {
  id: string;
  /** `id` of the PopupSectionDef to add to. A row aimed at a section that doesn't exist is ignored. */
  section: string;
  /** Named place inside the section; the section decides where each slot goes. Omit for "the end". */
  slot?: string;
  order: number;
  /** The row, or null to skip it for this school. */
  row: (p: School, h: Helpers) => RowEntry | null;
}

export interface PopupTagDef extends PhaseScoped {
  id: string;
  /** Position among the small tags under the school's name. */
  order: number;
  /** The tag to show, or null. `warn` highlights a caveat (e.g. "Independent"). */
  tag: (p: School) => { text: string; warn?: boolean } | null;
}

// ---------- "About the data" and the header's data dates ----------

export interface SourceNoteDef extends PhaseScoped {
  id: string;
  /** Position in the About list and the dates line. */
  order: number;
  /** An item in the "About the data" list (an <li>'s content), or null. */
  about?: (meta: Metadata, h: Helpers & { sourceLink: (sourceId: string, label: string) => Html }) => Html | null;
  /** Short strings for the dates line under the title, e.g. "GCSEs 2024/25". */
  dates?: (meta: Metadata) => (string | null | undefined | false)[];
}

// ---------- Extensions: a feature with its own interface ----------

/** What the app hands an extension when it starts. */
export interface AppApi {
  /** The loaded data: every school's core fields, `ensureFields` for mode columns and `getDetails(urn)` for popup fields. */
  data: SchoolData;
  /** Adds a block to the left panel, under the focus chips. */
  addPanelSection(element: HTMLElement): void;
  /** Opens a school's popup (and flies to it). */
  openSchool(urn: number, fly?: boolean): void;
  /** Sets a focus filter (see `ChipFilter`) to a value, or '' to clear it, and fits the map to its schools. */
  setFocus(filterId: string, value: string): Promise<void>;
  /** The value of a focus filter right now ('' when it is off). */
  focusValue(filterId: string): string;
  /** True on a phone-sized screen. */
  isNarrow(): boolean;
  /** Folds the panel down to its title bar on a phone, so the map is visible. */
  collapsePanel(): void;
}

/**
 * A feature with a user interface of its own (the shortlist comparison): `start` runs once the map and data are
 * ready. Keep its code in a file that is only imported from `start` (`web-ui.ts`), so the Node-side build, which
 * loads every web.ts, never sees DOM or CSS imports.
 */
export interface ExtensionDef extends PhaseScoped {
  id: string;
  start: (app: AppApi) => void | Promise<void>;
}

// ---------- What web.ts may export ----------

export interface WebExports {
  extensions?: ExtensionDef[];
  modes?: ModeDef[];
  filters?: FilterDef[];
  popupSections?: PopupSectionDef[];
  popupRows?: PopupRowDef[];
  popupTags?: PopupTagDef[];
  sourceNotes?: SourceNoteDef[];
}
