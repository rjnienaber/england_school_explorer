// The published data format (dist/data/) and how to read it back. Pure code with no Node
// APIs: the browser (web/data.ts), the exporter and the verifier all use it, so the three
// can't drift apart. Layout:
//
//   core.json            CoreFile: ids, positions, `core` fields as columns, plus the field table
//   modes/<field>.json   ColumnFile: one `mode` field for every school, in core's order
//   details/<n>.json     DetailFile: every non-core field (`detail` and `mode`) for the schools with
//                        urn % shards === n, so a popup is one request

export type Placement = 'core' | 'mode' | 'detail';
export type Value = number | string | boolean | null;

/** What a reader needs to know about a field to decode it. */
export interface FieldInfo {
  placement: Placement;
  type: 'number' | 'string' | 'boolean' | 'enum';
  /** Enum values. Enum columns hold an index into this list (or null). */
  lookup?: readonly (string | number)[];
  /** Present only for fields that can't be null: the value a school without a row gets. */
  default?: Value;
}

/**
 * What each part of the UI reads, found by running it over every school at build time (see
 * lib/trace-needs.ts). Authors never write this. Field names exclude `urn`.
 */
export interface Needs {
  /** By mode id. */
  modes: Record<string, string[]>;
  /** By filter id, then by the filter's value as a string ('true', 'false' or the option). */
  filters: Record<string, Record<string, string[]>>;
  /** By popup piece id: 'kind', 'place', 'tags' and 'section:<id>'. */
  popup: Record<string, string[]>;
}

export interface CoreFile {
  buildId: string;
  /** Number of schools. Every column below has this many entries. */
  count: number;
  /** Detail shard count: a school's shard is urn % shards. */
  shards: number;
  /** Dataset-level values: builtAt, sources and what modules add as `metadata`. */
  metadata: { builtAt: string; sources: Record<string, string> } & Record<string, unknown>;
  fields: Record<string, FieldInfo>;
  needs: Needs;
  /** URNs, ascending, stored as the first value then the difference from the previous one. */
  urnDeltas: number[];
  lng: number[];
  lat: number[];
  /** The `core` fields, encoded by `encodeColumn`. */
  columns: Record<string, (number | string | null)[]>;
}

export interface ColumnFile {
  buildId: string;
  values: (number | string | null)[];
}

export interface DetailFile {
  buildId: string;
  /** By URN, all non-core fields. Only values that differ from `missingValue` are present. */
  schools: Record<string, Record<string, Value>>;
}

export const missingValue = (f: FieldInfo): Value => ('default' in f ? (f.default ?? null) : null);

export function encodeCell(f: FieldInfo, v: Value): number | string | null {
  if (v === null || v === undefined) return null;
  if (f.type === 'boolean') return v ? 1 : 0;
  if (f.type === 'enum') {
    const i = f.lookup!.indexOf(v as string | number);
    if (i < 0) throw new Error(`${JSON.stringify(v)} is not in ${JSON.stringify(f.lookup)}`);
    return i;
  }
  return v as number | string;
}

export function decodeCell(f: FieldInfo, v: number | string | null): Value {
  if (v === null || v === undefined) return null;
  if (f.type === 'boolean') return v === 1;
  if (f.type === 'enum') return f.lookup![v as number];
  return v;
}

export const encodeColumn = (f: FieldInfo, values: Value[]) => values.map((v) => encodeCell(f, v));
export const decodeColumn = (f: FieldInfo, values: (number | string | null)[]) => values.map((v) => decodeCell(f, v));

export function decodeUrns(core: Pick<CoreFile, 'urnDeltas'>): number[] {
  let urn = 0;
  return core.urnDeltas.map((d) => (urn += d));
}

export const shardOf = (urn: number, shards: number) => urn % shards;

/** URL of a published file relative to the data folder, e.g. `modes/att8.json`. */
export const columnPath = (field: string) => `modes/${field}.json`;
export const shardPath = (shard: number) => `details/${shard}.json`;
