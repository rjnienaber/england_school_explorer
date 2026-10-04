// The build's intermediate SQLite store (build/schools.sqlite, built with node:sqlite).
//
// One table per module: dim_<id> (primary key urn, one column per declared field), plus
// dim_<id>__<name> for each long-format extra table. Modules never share a table.
// `schools` holds the in-scope URNs and where they are.

import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ExtraRow, ExtraTableDef, FieldDef, Fields } from './dimension.ts';
import { STORE_FILE } from './paths.ts';

export type Primitive = number | string | null;

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
export const tableName = (moduleId: string) => quote(`dim_${moduleId}`);
export const extraTableName = (moduleId: string, name: string) => quote(`dim_${moduleId}__${name}`);

/** Creates an empty store, replacing any existing file. */
export function createStore(file = STORE_FILE): DatabaseSync {
  mkdirSync(dirname(file), { recursive: true });
  for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(file + suffix, { force: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE schools (urn INTEGER PRIMARY KEY, lng REAL NOT NULL, lat REAL NOT NULL, sector TEXT NOT NULL, selective INTEGER NOT NULL);
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE coverage (module TEXT, field TEXT, non_null INTEGER, total INTEGER, PRIMARY KEY (module, field));
  `);
  return db;
}

/** Opens an existing store read-only, or returns null when there is none. */
export function openStore(file = STORE_FILE): DatabaseSync | null {
  try {
    return new DatabaseSync(file, { readOnly: true });
  } catch {
    return null;
  }
}

function sqlType(f: FieldDef): string {
  if (f.type === 'number') return 'REAL';
  if (f.type === 'string') return 'TEXT';
  if (f.type === 'boolean') return 'INTEGER';
  return f.values.every((v) => typeof v === 'number') ? 'INTEGER' : 'TEXT';
}

/** Checks one value against its declaration; returns what to store, or throws a message. */
export function encodeValue(name: string, f: FieldDef, value: unknown): Primitive {
  if (value === null || value === undefined) return null;
  switch (f.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name}: expected a finite number, got ${JSON.stringify(value)}`);
      return f.decimals === undefined ? value : Math.round(value * 10 ** f.decimals) / 10 ** f.decimals;
    }
    case 'string':
      if (typeof value !== 'string') throw new Error(`${name}: expected a string, got ${JSON.stringify(value)}`);
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`${name}: expected a boolean, got ${JSON.stringify(value)}`);
      return value ? 1 : 0;
    case 'enum':
      if (!f.values.includes(value as string | number)) {
        throw new Error(`${name}: ${JSON.stringify(value)} is not one of ${f.values.map((v) => JSON.stringify(v)).join(', ')}`);
      }
      return value as string | number;
  }
}

export function decodeValue(f: FieldDef, stored: unknown): number | string | boolean | null {
  if (stored === null || stored === undefined) return null;
  if (f.type === 'boolean') return stored === 1;
  return stored as number | string;
}

export interface InsertStats {
  inserted: number;
  /** Rows for URNs outside the scope, which are dropped. */
  outOfScope: number;
}

function transaction(db: DatabaseSync, work: () => void): void {
  db.exec('BEGIN');
  try {
    work();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Creates dim_<id> and inserts the module's rows, validating them against `fields`. */
export function writeModuleRows(
  db: DatabaseSync,
  moduleId: string,
  fields: Fields,
  rows: Iterable<{ urn: number } & Record<string, unknown>>,
  inScope: (urn: number) => boolean,
): InsertStats {
  const names = Object.keys(fields);
  const table = tableName(moduleId);
  db.exec(`CREATE TABLE ${table} (urn INTEGER PRIMARY KEY${names.map((n) => `, ${quote(n)} ${sqlType(fields[n])}`).join('')})`);
  const insert = db.prepare(`INSERT INTO ${table} (urn${names.map((n) => `, ${quote(n)}`).join('')}) VALUES (?${names.map(() => ', ?').join('')})`);
  const stats: InsertStats = { inserted: 0, outOfScope: 0 };
  const seen = new Set<number>();

  transaction(db, () => {
    for (const row of rows) {
      const at = `${moduleId}: urn ${row.urn}`;
      if (!Number.isInteger(row.urn)) throw new Error(`${moduleId}: row without an integer urn: ${JSON.stringify(row).slice(0, 200)}`);
      const unknown = Object.keys(row).filter((k) => k !== 'urn' && !(k in fields));
      if (unknown.length) throw new Error(`${at}: undeclared field(s) ${unknown.join(', ')}. Declare them in "fields".`);
      if (!inScope(row.urn)) {
        stats.outOfScope++;
        continue;
      }
      if (seen.has(row.urn)) throw new Error(`${at}: more than one row for this school`);
      seen.add(row.urn);
      const values = names.map((n) => {
        try {
          return encodeValue(n, fields[n], row[n] ?? (fields[n].nullable === false ? fields[n].default : null));
        } catch (err) {
          throw new Error(`${at}: ${(err as Error).message}`);
        }
      });
      insert.run(row.urn, ...values);
      stats.inserted++;
    }
  });
  return stats;
}

const COLUMN_SQL = { integer: 'INTEGER', real: 'REAL', text: 'TEXT' } as const;

export function writeExtraRows(
  db: DatabaseSync,
  moduleId: string,
  name: string,
  def: ExtraTableDef,
  rows: Iterable<ExtraRow>,
  inScope: (urn: number) => boolean,
): InsertStats {
  const cols = Object.keys(def.columns);
  const table = extraTableName(moduleId, name);
  db.exec(`CREATE TABLE ${table} (urn INTEGER NOT NULL${cols.map((c) => `, ${quote(c)} ${COLUMN_SQL[def.columns[c]]}`).join('')})`);
  db.exec(`CREATE INDEX ${quote(`idx_dim_${moduleId}__${name}_urn`)} ON ${table} (urn)`);
  const insert = db.prepare(`INSERT INTO ${table} (urn${cols.map((c) => `, ${quote(c)}`).join('')}) VALUES (?${cols.map(() => ', ?').join('')})`);
  const stats: InsertStats = { inserted: 0, outOfScope: 0 };
  transaction(db, () => {
    for (const row of rows) {
      const at = `${moduleId}.${name}: urn ${row.urn}`;
      if (!Number.isInteger(row.urn)) throw new Error(`${moduleId}.${name}: row without an integer urn`);
      const unknown = Object.keys(row).filter((k) => k !== 'urn' && !(k in def.columns));
      if (unknown.length) throw new Error(`${at}: undeclared column(s) ${unknown.join(', ')}`);
      if (!inScope(row.urn)) {
        stats.outOfScope++;
        continue;
      }
      const values = cols.map((c) => {
        const v = row[c] ?? null;
        const ok = v === null || (def.columns[c] === 'text' ? typeof v === 'string' : typeof v === 'number' && Number.isFinite(v));
        if (!ok) throw new Error(`${at}: column ${c} expects ${def.columns[c]}, got ${JSON.stringify(v)}`);
        return v;
      });
      insert.run(row.urn, ...values);
      stats.inserted++;
    }
  });
  return stats;
}

/** Reads a module's table back, decoding booleans. Keyed by URN. */
export function readModuleRows(db: DatabaseSync, moduleId: string, fields: Fields): Map<number, Record<string, unknown>> {
  const out = new Map<number, Record<string, unknown>>();
  for (const stored of db.prepare(`SELECT * FROM ${tableName(moduleId)}`).all() as Record<string, unknown>[]) {
    const row: Record<string, unknown> = {};
    for (const [name, f] of Object.entries(fields)) row[name] = decodeValue(f, stored[name]);
    out.set(stored.urn as number, row);
  }
  return out;
}

export function readExtraRows(db: DatabaseSync, moduleId: string, name: string): Record<string, unknown>[] {
  return db.prepare(`SELECT * FROM ${extraTableName(moduleId, name)}`).all() as Record<string, unknown>[];
}

export function setMeta(db: DatabaseSync, key: string, value: unknown): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

export function getMeta(db: DatabaseSync): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]) out[r.key] = JSON.parse(r.value);
  return out;
}

/** Non-null counts per field from a store, e.g. the previous build's. Empty when the store is missing. */
export function readCoverage(db: DatabaseSync | null): Map<string, { nonNull: number; total: number }> {
  const out = new Map<string, { nonNull: number; total: number }>();
  if (!db) return out;
  try {
    for (const r of db.prepare('SELECT module, field, non_null, total FROM coverage').all() as { module: string; field: string; non_null: number; total: number }[]) {
      out.set(`${r.module}.${r.field}`, { nonNull: r.non_null, total: r.total });
    }
  } catch {
    // older store without the table
  }
  return out;
}
