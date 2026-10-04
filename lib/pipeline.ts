// Runs every dimension module in dependency order and writes the results to the store.

import { existsSync, readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { readCsv } from './csv.ts';
import type { BuildContext, BuildResult, ExtraRow, Fields, RowOf, Scope, ScopeSchool, SourceDef } from './dimension.ts';
import { dataPath, SOURCES_FILE, STORE_FILE } from './paths.ts';
import type { LoadedDimension } from './registry.ts';
import { makeStatsToolkit } from './stats.ts';
import {
  createStore,
  openStore,
  readCoverage,
  readExtraRows,
  readModuleRows,
  setMeta,
  tableName,
  writeExtraRows,
  writeModuleRows,
} from './store.ts';

/** A source format change usually shows up as most schools vanishing; fail rather than publish a near-empty map. */
export const MIN_SCHOOLS = 3500;
/** Warn when a field is filled for this much fewer schools than in the previous build. */
const COVERAGE_DROP = 0.2;

export interface BuildOutcome {
  db: DatabaseSync;
  scope: Scope;
  metadata: Record<string, unknown>;
  warnings: string[];
}

export function readSourceUrls(file = SOURCES_FILE): Record<string, string> {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

function makeScope(schools: ScopeSchool[]): Scope {
  const byUrn = new Map(schools.map((s) => [s.urn, s]));
  return {
    urns: new Set(byUrn.keys()),
    all: schools,
    get: (urn) => byUrn.get(urn),
    isState: (urn) => byUrn.get(urn)?.sector === 'state',
  };
}

export async function buildStore(
  order: LoadedDimension[],
  opts: { storeFile?: string; minSchools?: number; log?: (msg: string) => void } = {},
): Promise<BuildOutcome> {
  const { storeFile = STORE_FILE, minSchools = MIN_SCHOOLS, log = console.log } = opts;
  const sourceDefs = new Map<string, SourceDef>(order.flatMap((d) => d.sources.map((s) => [s.id, s] as const)));
  const sources = readSourceUrls();
  const warnings: string[] = [];

  const previous = readCoverage(openStore(storeFile));
  const db = createStore(storeFile);
  const modules = new Map(order.map((d) => [d.id, d.module]));

  let scope: Scope | null = null;
  const metadata: Record<string, unknown> = {};
  const lazyScope: Scope = {
    get urns() { return need().urns; },
    get all() { return need().all; },
    get: (urn) => need().get(urn),
    isState: (urn) => need().isState(urn),
  };
  function need(): Scope {
    if (!scope) throw new Error('ctx.schools is not available to the scope module: it creates the scope');
    return scope;
  }

  for (const { id, module: m } of order) {
    const started = Date.now();
    const allowed = new Set([...(m.dependsOn ?? []), ...(m.scope ? [] : [order.find((d) => d.module.scope)!.id])]);
    const requireDep = (dep: string) => {
      if (!allowed.has(dep)) throw new Error(`${id}: reads "${dep}" but does not list it in dependsOn`);
      return modules.get(dep)!;
    };

    const ctx: BuildContext = {
      moduleId: id,
      db,
      sources,
      dataPath: (sourceId) => {
        const def = sourceDefs.get(sourceId);
        if (!def) throw new Error(`${id}: unknown source "${sourceId}"`);
        const file = dataPath(def.file ?? `${sourceId}.csv`);
        if (!existsSync(file)) throw new Error(`${id}: ${file} is missing; run "npm run fetch"`);
        return file;
      },
      csv: (sourceId) => readCsv(ctx.dataPath(sourceId), sourceDefs.get(sourceId)!.encoding),
      schools: lazyScope,
      read: (dep) => readModuleRows(db, dep, requireDep(dep).fields),
      readExtra: (dep, table) => {
        if (!requireDep(dep).extraTables?.[table]) throw new Error(`${id}: ${dep} has no extra table "${table}"`);
        return readExtraRows(db, dep, table);
      },
      get stats() {
        return makeStatsToolkit(need());
      },
      log: (message) => log(`  [${id}] ${message}`),
    };

    const raw = await m.build(ctx);
    const result: BuildResult = Symbol.iterator in raw ? { rows: raw as Iterable<RowOf<Fields>> } : (raw as BuildResult);

    let inserted: number;
    if (m.scope) {
      inserted = writeModuleRows(db, id, m.fields, result.rows, () => true).inserted;
      scope = buildScopeTable(db, id, m.fields, result);
      if (scope.all.length < minSchools) {
        throw new Error(`Only ${scope.all.length} schools built (expected at least ${minSchools}); check the source data`);
      }
    } else {
      const stats = writeModuleRows(db, id, m.fields, result.rows, (urn) => need().urns.has(urn));
      inserted = stats.inserted;
    }

    for (const name of Object.keys(result.extra ?? {})) {
      if (!m.extraTables?.[name]) throw new Error(`${id}: build() returned rows for undeclared extra table "${name}"`);
    }
    for (const [name, def] of Object.entries(m.extraTables ?? {})) {
      const rows: Iterable<ExtraRow> = result.extra?.[name] ?? [];
      writeExtraRows(db, id, name, def, rows, (urn) => need().urns.has(urn));
    }

    for (const [key, value] of Object.entries(result.metadata ?? {})) {
      if (key in metadata) throw new Error(`${id}: metadata key "${key}" is already set by another module`);
      metadata[key] = value;
    }

    recordCoverage(db, id, m.fields, need().all.length, previous, warnings);
    log(`  ${id}: ${inserted} rows (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }

  for (const [key, value] of Object.entries(metadata)) setMeta(db, `metadata.${key}`, value);
  setMeta(db, 'builtAt', new Date().toISOString());
  setMeta(db, 'order', order.map((d) => d.id));
  return { db, scope: need(), metadata, warnings };
}

function buildScopeTable(db: DatabaseSync, id: string, fields: Fields, result: BuildResult): Scope {
  if (fields.sector?.type !== 'enum' && fields.sector?.type !== 'string') {
    throw new Error(`${id}: the scope module must declare a "sector" field (e.g. 'state' | 'independent')`);
  }
  if (fields.selective && fields.selective.type !== 'boolean') throw new Error(`${id}: "selective" must be a boolean field`);
  if (!result.locations) throw new Error(`${id}: the scope module must return "locations" ({ urn, lng, lat }) from build()`);
  const where = new Map<number, { lng: number; lat: number }>();
  for (const l of result.locations) where.set(l.urn, l);

  const rows = readModuleRows(db, id, fields);
  const schools: ScopeSchool[] = [];
  const insert = db.prepare('INSERT INTO schools (urn, lng, lat, sector, selective) VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  for (const [urn, row] of rows) {
    const loc = where.get(urn);
    if (!loc) throw new Error(`${id}: urn ${urn} is in scope but has no location`);
    const school: ScopeSchool = { urn, lng: loc.lng, lat: loc.lat, sector: String(row.sector), selective: row.selective === true };
    insert.run(urn, school.lng, school.lat, school.sector, school.selective ? 1 : 0);
    schools.push(school);
  }
  db.exec('COMMIT');
  return makeScope(schools);
}

function recordCoverage(
  db: DatabaseSync,
  id: string,
  fields: Fields,
  total: number,
  previous: Map<string, { nonNull: number; total: number }>,
  warnings: string[],
): void {
  const table = tableName(id);
  const insert = db.prepare('INSERT INTO coverage (module, field, non_null, total) VALUES (?, ?, ?, ?)');
  for (const name of Object.keys(fields)) {
    const { n } = db.prepare(`SELECT COUNT("${name}") AS n FROM ${table}`).get() as { n: number };
    insert.run(id, name, n, total);
    const before = previous.get(`${id}.${name}`);
    if (before && before.nonNull > 0 && n / total < (before.nonNull / before.total) * (1 - COVERAGE_DROP)) {
      const msg = `${id}.${name} is filled for ${n} schools, down from ${before.nonNull}: check the source`;
      warnings.push(msg);
      console.warn(`  WARNING ${msg}`);
    }
  }
}
