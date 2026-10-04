// Writes the store out as the site's data files, in dist/data/ (see lib/columnar.ts for the
// layout): a small core.json loaded at start-up, one file per `mode` field loaded the first
// time a mode or filter needs it, and `detail` fields sharded by URN for popups.
//
// Which fields a mode, filter or popup piece needs is found by running them (trace-needs.ts),
// not declared, and checked against each field's `placement` here.

import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { DatabaseSync } from 'node:sqlite';
import { columnPath, encodeColumn, missingValue, shardOf, shardPath, type CoreFile, type FieldInfo, type Needs, type Value } from './columnar.ts';
import type { FieldDef } from './dimension.ts';
import type { LoadedDimension } from './registry.ts';
import { getMeta, readModuleRows } from './store.ts';
import { traceNeeds } from './trace-needs.ts';

/** Secondary schools spread over this many popup shards (about 65 schools, 10-20 KB gzipped, each). */
export const SHARDS = 64;
/** What search, the list and hover tips read directly, so they must always be loaded. */
export const CLIENT_CORE = ['name', 'la', 'town'];

export interface ManifestFile {
  path: string;
  raw: number;
  gzip: number;
}
export interface Manifest {
  buildId: string;
  builtAt: string;
  schools: number;
  shards: number;
  files: ManifestFile[];
  /** Sizes in bytes. `modeMax` and `detailMax` are the largest single file of that kind. */
  totals: { coreGzip: number; coreRaw: number; modeMaxGzip: number; detailMaxGzip: number; allGzip: number; allRaw: number };
}

export interface DataExport {
  buildId: string;
  builtAt: string;
  /** Path (relative to dist/data) to file content. */
  files: Map<string, string>;
  /** Complete records in core's order, as the browser sees them once everything has loaded. */
  records: Record<string, unknown>[];
  needs: Needs;
  fields: Record<string, FieldInfo>;
  warnings: string[];
}

const fieldInfo = (f: FieldDef, placement = f.placement): FieldInfo => {
  const info: FieldInfo = { placement, type: f.type };
  if (f.type === 'enum') info.lookup = f.values;
  if (f.nullable === false) info.default = (f.default ?? null) as Value;
  return info;
};

export function fieldTable(order: LoadedDimension[]): Record<string, FieldInfo> {
  const out: Record<string, FieldInfo> = {};
  for (const d of order) for (const [name, f] of Object.entries(d.module.fields)) out[name] = fieldInfo(f);
  return out;
}

/** Throws when the UI reads a field that isn't loaded early enough; returns advice for the rest. */
export function checkPlacements(fields: Record<string, FieldInfo>, needs: Needs, startup: string[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const placement = (n: string) => fields[n]?.placement;

  const mustBeLoaded: [string, string[]][] = [
    ...Object.entries(needs.modes).map(([id, fs]) => [`mode "${id}"`, fs] as [string, string[]]),
    ...Object.entries(needs.filters).flatMap(([id, byValue]) => Object.values(byValue).map((fs) => [`filter "${id}"`, fs] as [string, string[]])),
    ['search, the list and hover tips', CLIENT_CORE],
  ];
  const usedByUi = new Set<string>();
  for (const [what, fs] of mustBeLoaded) {
    for (const n of fs) {
      usedByUi.add(n);
      if (placement(n) === 'detail') {
        errors.push(`${what} reads "${n}", which is placement 'detail' (only loaded for popups). Make it 'mode'.`);
      }
    }
  }
  for (const n of CLIENT_CORE) if (placement(n) !== 'core') errors.push(`"${n}" is read by search, the list and hover tips, so it must be placement 'core'.`);

  for (const n of startup) {
    if (placement(n) === 'mode') warnings.push(`"${n}" is read by the default mode or default filters, so it is fetched on every start-up. Consider placement 'core'.`);
  }
  const popupHeader = new Set(['kind', 'place', 'tags'].flatMap((id) => needs.popup[id] ?? []));
  const needed = new Set([...startup, ...CLIENT_CORE, ...popupHeader]);
  for (const [n, f] of Object.entries(fields)) {
    if (f.placement === 'core' && !needed.has(n)) warnings.push(`"${n}" is placement 'core' but nothing needs it at start-up; every visitor downloads it. Consider 'mode' or 'detail'.`);
    if (f.placement === 'mode' && !usedByUi.has(n)) warnings.push(`"${n}" is placement 'mode' but no mode or filter reads it. Consider 'detail'.`);
  }
  return { errors, warnings };
}

/** The fields read before the first render with default settings: default mode and default filter values. */
export async function startupFields(needs: Needs): Promise<string[]> {
  const { MODES, FILTERS } = await import('../web/registry.ts');
  return [...new Set([...needs.modes[MODES[0].id], ...FILTERS.flatMap((f) => needs.filters[f.id][String(f.default)])])].sort();
}

export async function exportData(db: DatabaseSync, order: LoadedDimension[], sources: Record<string, string>): Promise<DataExport> {
  const meta = getMeta(db);
  const fields = fieldTable(order);
  const tables = order.map((d) => ({ fields: d.module.fields, rows: readModuleRows(db, d.id, d.module.fields) }));
  const schools = db.prepare('SELECT urn, lng, lat FROM schools ORDER BY urn').all() as { urn: number; lng: number; lat: number }[];

  const records = schools.map((s) => {
    const record: Record<string, unknown> = { urn: s.urn };
    for (const { fields: defs, rows } of tables) {
      const row = rows.get(s.urn);
      for (const [name, f] of Object.entries(defs)) {
        const value = row ? row[name] : undefined;
        record[name] = value === null || value === undefined ? (f.nullable === false ? f.default : null) : value;
      }
    }
    return record;
  });

  const needs = await traceNeeds(records, Object.keys(fields));
  const { errors, warnings } = checkPlacements(fields, needs, await startupFields(needs));
  if (errors.length) throw new Error(`Field placement problems:\n  ${errors.join('\n  ')}`);

  const column = (name: string) => encodeColumn(fields[name], records.map((r) => r[name] as Value));
  const names = (placement: string) => Object.keys(fields).filter((n) => fields[n].placement === placement);

  let urn = 0;
  const metadata = { builtAt: meta.builtAt as string, sources } as CoreFile['metadata'];
  for (const [key, value] of Object.entries(meta)) if (key.startsWith('metadata.')) metadata[key.slice('metadata.'.length)] = value;
  const core: Omit<CoreFile, 'buildId'> = {
    count: schools.length,
    shards: SHARDS,
    metadata,
    fields,
    needs,
    urnDeltas: schools.map((s) => {
      const delta = s.urn - urn;
      urn = s.urn;
      return delta;
    }),
    lng: schools.map((s) => s.lng),
    lat: schools.map((s) => s.lat),
    columns: Object.fromEntries(names('core').map((n) => [n, column(n)])),
  };

  const modeFiles = names('mode').map((n) => ({ path: columnPath(n), body: { values: column(n) } }));

  const shards: Record<string, Record<string, Value>>[] = Array.from({ length: SHARDS }, () => ({}));
  // A school's shard holds all its non-core fields, `mode` ones too (a few KB in all), so a
  // popup is one request however many columns it reads
  const shardNames = Object.keys(fields).filter((n) => fields[n].placement !== 'core');
  for (const record of records) {
    const values: Record<string, Value> = {};
    for (const n of shardNames) {
      const v = record[n] as Value;
      if (v !== missingValue(fields[n])) values[n] = v;
    }
    shards[shardOf(record.urn as number, SHARDS)][record.urn as number] = values;
  }
  const detailFiles = shards.map((schoolsInShard, i) => ({ path: shardPath(i), body: { schools: schoolsInShard } }));

  // One id for the whole set, derived from the content: files only match each other when it does
  const bodies = [{ path: 'core.json', body: core }, ...modeFiles, ...detailFiles];
  const hash = createHash('sha256');
  for (const { path, body } of bodies) hash.update(path).update(JSON.stringify(body));
  const buildId = hash.digest('hex').slice(0, 12);

  const files = new Map<string, string>();
  for (const { path, body } of bodies) files.set(path, JSON.stringify({ buildId, ...body }));
  return { buildId, builtAt: metadata.builtAt, files, records, needs, fields, warnings };
}

/** Replaces dist/data with the exported files plus manifest.json (sizes for the budget check). */
export async function writeData(dataDir: string, result: DataExport): Promise<Manifest> {
  await rm(dataDir, { recursive: true, force: true });
  const sizes: ManifestFile[] = [];
  for (const [path, content] of result.files) {
    const file = join(dataDir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
    sizes.push({ path, raw: Buffer.byteLength(content), gzip: gzipSync(content, { level: 9 }).length });
  }
  const max = (prefix: string, key: 'gzip') => Math.max(0, ...sizes.filter((s) => s.path.startsWith(prefix)).map((s) => s[key]));
  const core = sizes.find((s) => s.path === 'core.json')!;
  const manifest: Manifest = {
    buildId: result.buildId,
    builtAt: result.builtAt,
    schools: result.records.length,
    shards: SHARDS,
    files: sizes,
    totals: {
      coreGzip: core.gzip,
      coreRaw: core.raw,
      modeMaxGzip: max('modes/', 'gzip'),
      detailMaxGzip: max('details/', 'gzip'),
      allGzip: sizes.reduce((n, s) => n + s.gzip, 0),
      allRaw: sizes.reduce((n, s) => n + s.raw, 0),
    },
  };
  await writeFile(join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
