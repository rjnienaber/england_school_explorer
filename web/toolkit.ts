// What a dimension's web.ts imports: the types it fills in and small helpers. Also exports
// the helper object `h` that the popup framework passes to `render`.
//
// A web.ts may export any of: modes, filters, popupSections, popupRows, popupTags, sourceNotes.

import type { SchoolRecord, Metadata } from './types.ts';
import type { PaletteName } from './palette.ts';

export type { Metadata, PaletteName, SchoolRecord };
/** One school's properties, typed from the field declarations. */
export type School = SchoolRecord;

// ---------- Colour modes ----------

export interface Bucket {
  label: string;
  /** Index into the mode's palette (0-4). 4 is best / highest. */
  colour: number;
}

export interface ModeDef {
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

interface FilterBase {
  /** Unique across modules. Also the key the value is saved under in localStorage. */
  id: string;
  /** Position in the "Show" list. */
  order: number;
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

export type FilterDef = CheckboxFilter | SelectFilter;

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
}

/** A value with its 95% confidence interval as a small SVG range chart. */
export function ciChart(o: CiChartOptions): Html {
  const d = o.decimals ?? 2;
  const x = (v: number) => 4 + ((Math.max(o.min, Math.min(o.max, v)) - o.min) / (o.max - o.min)) * 252;
  const label = `${o.name} ${signed(o.value, d)}, 95% confidence interval ${signed(o.lower, d)} to ${signed(o.upper, d)}`;
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

/** The helpers handed to `render` and the source-note callbacks. */
export const h = { html, raw, rows, note, meta, link, ciChart, escapeHtml, fmt, signed, ordinal, formatDate };
export type Helpers = typeof h;

export interface PopupSectionDef {
  /** Unique across modules. */
  id: string;
  /** Position in the popup, below the school's name and tags. */
  order: number;
  /** Heading above the section. Omit for none. */
  title?: string | ((p: School) => string);
  /**
   * The section's body, or null to leave the whole section out (title included).
   * `extra(slot?)` returns the rows other modules contributed to this section with
   * `popupRows` (those aimed at `slot`, or the unslotted ones), already sorted.
   */
  render: (p: School, h: Helpers, extra: (slot?: string) => RowEntry[]) => Html | null;
}

/** A row a module adds to another module's popup section, e.g. a new line in the GCSE results table. */
export interface PopupRowDef {
  id: string;
  /** `id` of the PopupSectionDef to add to. A row aimed at a section that doesn't exist is ignored. */
  section: string;
  /** Named place inside the section; the section decides where each slot goes. Omit for "the end". */
  slot?: string;
  order: number;
  /** The row, or null to skip it for this school. */
  row: (p: School, h: Helpers) => RowEntry | null;
}

export interface PopupTagDef {
  id: string;
  /** Position among the small tags under the school's name. */
  order: number;
  /** The tag to show, or null. `warn` highlights a caveat (e.g. "Independent"). */
  tag: (p: School) => { text: string; warn?: boolean } | null;
}

// ---------- "About the data" and the header's data dates ----------

export interface SourceNoteDef {
  id: string;
  /** Position in the About list and the dates line. */
  order: number;
  /** An item in the "About the data" list (an <li>'s content), or null. */
  about?: (meta: Metadata, h: Helpers & { sourceLink: (sourceId: string, label: string) => Html }) => Html | null;
  /** Short strings for the dates line under the title, e.g. "GCSEs 2024/25". */
  dates?: (meta: Metadata) => (string | null | undefined | false)[];
}

// ---------- What web.ts may export ----------

export interface WebExports {
  modes?: ModeDef[];
  filters?: FilterDef[];
  popupSections?: PopupSectionDef[];
  popupRows?: PopupRowDef[];
  popupTags?: PopupTagDef[];
  sourceNotes?: SourceNoteDef[];
}
