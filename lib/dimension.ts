// The contract between a dimension module (dimensions/<id>/build.ts) and the build
// pipeline. See docs/adding-a-dimension.md for the walkthrough.

import type { DatabaseSync } from 'node:sqlite';
import type { Row } from './csv.ts';
import type { Phase } from './phase.ts';
import type { MultipleFit } from './stats.ts';

export type { Phase };

// ---------- Sources ----------

export interface SourceDef {
  /** Unique across all modules. The file is saved as data/<id>.csv (or `file`). */
  id: string;
  /** One line: what this file is. Shown in the README "Data sources" table. */
  describe: string;
  /** Page a human can open to see the source. */
  homepage: string;
  publisher: string;
  licence: string;
  /** How often it changes, e.g. "annually (March)", "monthly", "daily". */
  updated: string;
  /** Short list of what we take from it. README only. */
  usedFor?: string;
  /** Quirks worth knowing (encoding, suppression codes, how the URL is found). README only. */
  notes?: string;
  /**
   * Returns the download URL, or several candidates to try in order (the first that
   * downloads wins; GIAS uses this for "today's extract may not exist yet").
   */
  resolve?: () => Promise<string | string[]>;
  /**
   * For a source that is not one file at one URL (a filtered or paged API query, for example): writes the file
   * itself and returns the page to record in data/sources.json (what the About text links to). Used instead of
   * `resolve`. `downloadEesQuery` in lib/ees.ts is one (the census uses it to fetch 1 MB instead of a 2.8 GB file), and
   * `downloadFilteredCsv` in lib/filter-csv.ts keeps only the rows and columns wanted from a CSV that has no API.
   */
  fetchTo?: (file: string) => Promise<string>;
  /**
   * For a file that never changes (a published edition: a new edition is a new URL and a new module version): its URL.
   * `fetch --force` keeps a copy that is already in data/ instead of downloading it again (naming the source on the
   * command line still does), and records this URL. Use `fetchTo` or `resolve` as usual for the first download.
   */
  fixedUrl?: string;
  /** Text encoding of the file, as a WHATWG label. Default 'utf-8'. */
  encoding?: string;
  /** File name inside data/. Default `<id>.csv`. */
  file?: string;
}

// ---------- Fields ----------

/**
 * Where a field is published (used by #31, which splits the output by placement):
 * - `core`: needed at start-up: identity, search, filters, and whatever the default
 *   map mode uses. Keep this tiny.
 * - `mode`: needed for every school, but only once a mode, filter or the list uses it.
 * - `detail`: only shown in the popup for one school at a time.
 */
export type Placement = 'core' | 'mode' | 'detail';

interface FieldBase {
  placement: Placement;
  /** Plain-English name. Also used in the data dictionary. */
  label: string;
  description?: string;
  /** id of the `SourceDef` this comes from. */
  source?: string;
  /** Name of another field of this module holding the data year, e.g. 'ks4Year'. */
  year?: string;
  /** Default true. When false, schools without a row get `default` instead of null. */
  nullable?: boolean;
  default?: unknown;
  /**
   * Mode-placement field that no mode or filter reads on purpose, because the browser fetches the column on request
   * (the rank band, shortlist comparison). Silences the build note "placement 'mode' but nothing reads it".
   */
  lazy?: boolean;
}

export interface NumberField extends FieldBase {
  type: 'number';
  /** Values are rounded to this many places when stored. */
  decimals?: number;
  unit?: string;
}
export interface StringField extends FieldBase {
  type: 'string';
}
export interface BooleanField extends FieldBase {
  type: 'boolean';
}
export interface EnumField extends FieldBase {
  type: 'enum';
  /** The allowed values (strings or numbers). Becomes a union type in the browser. */
  values: readonly (string | number)[];
}

export type FieldDef = NumberField | StringField | BooleanField | EnumField;
export type Fields = Record<string, FieldDef>;

/** TypeScript type of a field's value, without null. */
export type ValueOf<F extends FieldDef> = F extends NumberField
  ? number
  : F extends StringField
    ? string
    : F extends BooleanField
      ? boolean
      : F extends EnumField
        ? F['values'][number]
        : never;

/** What `build()` returns per school. Omitted fields become null (or their default). */
export type RowOf<F extends Fields> = { urn: number } & { [K in keyof F]?: ValueOf<F[K]> | null };

// ---------- Long-format tables ----------

export type ColumnType = 'integer' | 'real' | 'text';
export interface ExtraTableDef {
  description: string;
  /** `urn` is added automatically; do not declare it. */
  columns: Record<string, ColumnType>;
}
export type ExtraRow = { urn: number } & Record<string, number | string | null>;

// ---------- Build context ----------

export interface ScopeSchool {
  urn: number;
  lng: number;
  lat: number;
  sector: string;
  selective: boolean;
}

/** The in-scope schools, as decided by the scope module (`gias-core`). */
export interface Scope {
  urns: ReadonlySet<number>;
  all: readonly ScopeSchool[];
  get(urn: number): ScopeSchool | undefined;
  isState(urn: number): boolean;
}

export interface StatsToolkit {
  /**
   * Percentile (0-100) of a value among state-funded mainstream schools. Pass the
   * (urn, value) pairs that form the population: independent schools in it are ignored.
   * With `higherIsBetter: false` a low value gets a high percentile.
   */
  percentileAmongState(
    population: Iterable<[urn: number, value: number]>,
    opts?: { higherIsBetter?: boolean },
  ): (value: number) => number;
  /** Median of the state-funded mainstream schools' values. */
  nationalMedianAmongState(population: Iterable<[urn: number, value: number]>): number | null;
  linearFit(points: [x: number, y: number][]): { intercept: number; slope: number; r: number };
  /** Multiple linear regression of y on several predictors (see `multipleFit` in lib/stats.ts). */
  multipleFit(x: number[][], y: number[]): MultipleFit;
  mean(values: number[]): number | null;
  round(value: number | null, places?: number): number | null;
}

export interface BuildContext {
  moduleId: string;
  /** The phase being built. A module that applies to several phases (gias-core, ofsted) runs once per phase, each time with that phase's schools. */
  phase: Phase;
  /** The build store. Read other modules' tables via `read()`; don't write to it. */
  db: DatabaseSync;
  /** Resolved download URLs, from data/sources.json. */
  sources: Record<string, string>;
  /** Path of a downloaded source file. */
  dataPath(sourceId: string): string;
  /** Streams a source CSV using the encoding declared on its SourceDef. */
  csv(sourceId: string): AsyncGenerator<Row>;
  /** In-scope schools. Not available to the scope module itself (it creates them). */
  schools: Scope;
  /** A dependency's rows by URN (declared fields only, decoded). Must be in `dependsOn`. */
  read(moduleId: string): Map<number, Record<string, unknown>>;
  /** A dependency's long-format table. Must be in `dependsOn`. */
  readExtra(moduleId: string, table: string): Record<string, unknown>[];
  stats: StatsToolkit;
  log(message: string): void;
}

export interface BuildResult<F extends Fields = Fields> {
  rows: Iterable<RowOf<F>>;
  /** Rows for the module's `extraTables`, by table name. */
  extra?: Record<string, Iterable<ExtraRow>>;
  /** Scope module only: where each school is (WGS84). Becomes the GeoJSON geometry. */
  locations?: Iterable<{ urn: number; lng: number; lat: number }>;
  /** Dataset-level values handed to the browser as `collection.metadata` (JSON-able). */
  metadata?: Record<string, unknown>;
}

export interface DimensionModule<F extends Fields = Fields> {
  /** Must equal the folder name: lower-case letters, digits and hyphens. */
  id: string;
  /** Plain-English name for docs and the data dictionary. */
  title: string;
  /** Modules whose tables this one reads. Built first. The scope module is implied. */
  dependsOn?: string[];
  /**
   * The phases this module applies to. Default `['secondary']`, so KS4 modules need not say anything. A module for
   * both (the scope module, Ofsted, trusts) lists both and runs once per phase against that phase's schools: its
   * `build()` sees only that phase in `ctx.schools`, and its fields exist only in the phases it lists. Its web.ts
   * items follow it, and each may narrow that with its own `phases` (a "sixth form" filter on a module for both).
   * A module may only depend on modules that cover all its phases.
   */
  phases?: readonly Phase[];
  /** Exactly one module sets this (gias-core): its rows define which schools exist. */
  scope?: boolean;
  fields: F;
  extraTables?: Record<string, ExtraTableDef>;
  build(ctx: BuildContext): Promise<BuildResult<F> | Iterable<RowOf<F>>> | BuildResult<F> | Iterable<RowOf<F>>;
}

/** Identity function that infers the row type of `build()` from `fields`. */
export function defineDimension<const F extends Fields>(m: DimensionModule<F>): DimensionModule<F> {
  return m;
}
