// Turns the build store into the files published as GitHub Release assets (see scripts/export-release.ts):
// schools.csv, england_schools.sqlite, fields.csv, sources.csv and NOTES.md.
//
// Everything is generic over the dimension modules: the CSV columns, the `wide` view and the data
// dictionary come from each module's `fields` and `extraTables`, so a new module needs no change here.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'csv-parse/sync';
import type { FieldDef } from './dimension.ts';
import type { LoadedDimension } from './registry.ts';
import { extraTableName, getMeta, tableName } from './store.ts';

export const LICENCE_STATEMENT = 'Contains public sector information licensed under the Open Government Licence v3.0.';
export const LICENCE_URL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

export const FILES = { csv: 'schools.csv', sqlite: 'england_schools.sqlite', fields: 'fields.csv', sources: 'sources.csv', notes: 'NOTES.md' } as const;

// ---------- Personal data ----------

/**
 * Column and table names that mean personal data. GIAS has head teacher names and telephone numbers,
 * which must never reach a release (they are personal data about named people). A name matching
 * any of these fails the export and the tests, so a new module can't add one by accident.
 */
export const PERSONAL_DATA_NAMES: { pattern: RegExp; why: string }[] = [
  { pattern: /head.?(title|first|last|preferred|teacher|name)/i, why: 'head teacher name or title (GIAS HeadTitle, HeadFirstName, HeadLastName, HeadPreferredJobTitle)' },
  { pattern: /(tele)?phone|^tel(num(ber)?)?$|mobile|fax/i, why: 'telephone number' },
  { pattern: /e.?mail/i, why: 'email address' },
  { pattern: /first.?name|last.?name|sur.?name|fore.?name|full.?name|contact.?(name|person)/i, why: 'a person\'s name' },
  { pattern: /^props?(name)?$|proprietor|principal.?name|chair.?of|governor.?name/i, why: 'proprietor, principal or governor name' },
  { pattern: /birth|^dob$/i, why: 'date of birth' },
];

/** Names (tables or columns) that look like personal data, each with the reason. Empty when all is well. */
export function personalDataProblems(names: Iterable<string>): string[] {
  const problems: string[] = [];
  for (const name of names) {
    for (const { pattern, why } of PERSONAL_DATA_NAMES) if (pattern.test(name)) problems.push(`"${name}" looks like ${why}`);
  }
  return problems;
}

const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// UK numbers start 0 or +44; ISO dates (2025-01-29) and URNs therefore do not match
const PHONE_VALUE = /^(\+44|0)[\d\s()-]{9,}\d$/;

/** A string value that is an email address or a telephone number (a last line of defence on values). */
export function looksPersonalValue(value: unknown): boolean {
  return typeof value === 'string' && (EMAIL_VALUE.test(value) || PHONE_VALUE.test(value.trim()));
}

// ---------- CSV ----------

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** CSV text with a BOM (so Excel detects UTF-8) and CRLF line ends. */
export function toCsv(header: string[], rows: Iterable<unknown[]>): string {
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function parseCsv(text: string): Record<string, string>[] {
  return parse(text, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
}

// ---------- The dictionary ----------

export interface FieldRow {
  field: string;
  table: string;
  label: string;
  description: string;
  type: string;
  unit: string | null;
  year_field: string | null;
  source_id: string | null;
  source_url: string | null;
  coverage: number;
}
export const FIELD_COLUMNS: (keyof FieldRow)[] = ['field', 'table', 'label', 'description', 'type', 'unit', 'year_field', 'source_id', 'source_url', 'coverage'];

const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

function describe(f: FieldDef): string {
  const parts = [(f.description ?? f.label).replace(/\.$/, '')];
  if (f.type === 'enum') parts.push(`One of: ${f.values.join(', ')}`);
  if (f.type === 'boolean') parts.push('True/false in the CSV, 1/0 in SQLite');
  if (f.nullable === false) parts.push('Filled for every school');
  else parts.push('Empty when the school has no value or the source suppressed it');
  return `${parts.filter(Boolean).join('. ')}.`;
}

/** One row per published column: the school identity columns, each module field, each extra-table column. */
export function buildDictionary(db: DatabaseSync, order: LoadedDimension[], sourceUrls: Record<string, string>): FieldRow[] {
  const count = (table: string, column: string) => (db.prepare(`SELECT COUNT(${q(column)}) AS n FROM ${table}`).get() as { n: number }).n;
  const rows: FieldRow[] = [
    { field: 'urn', table: 'schools', label: 'URN', description: 'Unique Reference Number from Get Information About Schools; the key joining every table.', type: 'integer', unit: null, year_field: null, source_id: null, source_url: null, coverage: count('schools', 'urn') },
    { field: 'lng', table: 'schools', label: 'Longitude', description: 'WGS84, converted from the British National Grid easting and northing in GIAS (accurate to a few metres).', type: 'number', unit: 'degrees', year_field: null, source_id: 'gias', source_url: sourceUrls.gias ?? null, coverage: count('schools', 'lng') },
    { field: 'lat', table: 'schools', label: 'Latitude', description: 'WGS84, converted from the British National Grid easting and northing in GIAS (accurate to a few metres).', type: 'number', unit: 'degrees', year_field: null, source_id: 'gias', source_url: sourceUrls.gias ?? null, coverage: count('schools', 'lat') },
  ];
  for (const { id, module: m } of order) {
    for (const [name, f] of Object.entries(m.fields)) {
      rows.push({
        field: name,
        table: `dim_${id}`,
        label: f.label,
        description: describe(f),
        type: f.type,
        unit: f.type === 'number' ? (f.unit ?? null) : null,
        year_field: f.year ?? null,
        source_id: f.source ?? null,
        source_url: f.source ? (sourceUrls[f.source] ?? null) : null,
        coverage: count(tableName(id), name),
      });
    }
    for (const [name, def] of Object.entries(m.extraTables ?? {})) {
      for (const [column, type] of Object.entries(def.columns)) {
        rows.push({
          field: column,
          table: `dim_${id}__${name}`,
          label: column,
          description: `${def.description}. Long format: a school can have several rows.`,
          type,
          unit: null,
          year_field: null,
          source_id: null,
          source_url: null,
          coverage: count(extraTableName(id, name), column),
        });
      }
    }
  }
  return rows;
}

// ---------- The SQLite file ----------

/** Names of the columns in the `wide` view: urn, lng, lat, then every module's fields in build order. */
export function wideColumns(order: LoadedDimension[]): string[] {
  return ['urn', 'lng', 'lat', ...order.flatMap((d) => Object.keys(d.module.fields))];
}

export function createWideView(db: DatabaseSync, order: LoadedDimension[]): void {
  const seen = new Set(['urn', 'lng', 'lat']);
  for (const d of order) {
    for (const name of Object.keys(d.module.fields)) {
      if (seen.has(name)) throw new Error(`${d.id}: field "${name}" clashes with a school column of the release`);
      seen.add(name);
    }
  }
  const select = ['s.urn AS urn', 's.lng AS lng', 's.lat AS lat'];
  for (const d of order) for (const name of Object.keys(d.module.fields)) select.push(`${tableName(d.id)}.${q(name)} AS ${q(name)}`);
  const joins = order.map((d) => `LEFT JOIN ${tableName(d.id)} ON ${tableName(d.id)}.urn = s.urn`).join(' ');
  db.exec(`CREATE VIEW wide AS SELECT ${select.join(', ')} FROM schools s ${joins} ORDER BY s.urn`);
}

export interface SourceRow {
  id: string;
  title: string;
  publisher: string;
  homepage: string;
  url: string | null;
  fetched_at: string | null;
  licence: string;
  updated: string;
}
export const SOURCE_COLUMNS: (keyof SourceRow)[] = ['id', 'title', 'publisher', 'homepage', 'url', 'fetched_at', 'licence', 'updated'];

export function buildSources(order: LoadedDimension[], sourceUrls: Record<string, string>): SourceRow[] {
  return order.flatMap((d) => d.sources).map((s) => ({
    id: s.id,
    title: s.describe,
    publisher: s.publisher,
    homepage: s.homepage,
    url: sourceUrls[s.id] ?? null,
    fetched_at: sourceUrls.fetchedAt ?? null,
    licence: s.licence,
    updated: s.updated,
  }));
}

function insertAll(db: DatabaseSync, table: string, columns: string[], rows: Record<string, unknown>[]): void {
  const insert = db.prepare(`INSERT INTO ${q(table)} (${columns.map(q).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
  db.exec('BEGIN');
  for (const r of rows) insert.run(...columns.map((c) => (r[c] ?? null) as null | number | string));
  db.exec('COMMIT');
}

// ---------- Notes ----------

const DATE_LABELS: Record<string, string> = {
  ks4Years: 'Key stage 4 results, years in the file',
  p8Year: 'Progress 8 as at',
  ofstedAsAt: 'Ofsted inspections as at',
};

export interface NotesInput {
  month: string;
  counts: { total: number; bySector: Record<string, number> };
  metadata: Record<string, unknown>;
  added: string[];
  removed: string[];
  /** false when there was no earlier release to compare with */
  hadPrevious: boolean;
  sources: SourceRow[];
}

export function releaseNotes(n: NotesInput): string {
  const sectors = Object.entries(n.counts.bySector).map(([s, c]) => `${c.toLocaleString('en-GB')} ${s}`).join(', ');
  const dates = Object.entries(n.metadata).map(([k, v]) => `- ${DATE_LABELS[k] ?? k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  const list = (items: string[]) => (items.length ? items.map((i) => `\`${i}\``).join(', ') : 'none');
  const lines = [
    `# Data ${n.month}`,
    '',
    `Every in-scope secondary school in England (${n.counts.total.toLocaleString('en-GB')}: ${sectors}), joined from the sources below by URN.`,
    '',
    '## Files',
    '',
    `- \`${FILES.csv}\`: one row per school, the latest value of every field (UTF-8 with a BOM, so Excel shows accents correctly).`,
    `- \`${FILES.sqlite}\`: SQLite. \`schools\`, one \`dim_<module>\` table per dimension, long-format tables (\`dim_<module>__<name>\`), a \`wide\` view joining all of them (the same as the CSV), and the \`fields\` and \`sources\` tables.`,
    `- \`${FILES.fields}\`: the data dictionary: every column with its label, description, type, unit, source and how many schools have a value.`,
    `- \`${FILES.sources}\`: where each source was downloaded from, and when.`,
    '',
    'Empty (CSV) or NULL (SQLite) means no value: the school has no data, or DfE suppressed it. The original suppression codes (`c`, `z`, `x`, `low`) are not kept.',
    '',
    '## Data as at',
    '',
    ...(dates.length ? dates : ['- (none recorded)']),
    '',
    '## Fields since the previous release',
    '',
    ...(n.hadPrevious ? [`- Added: ${list(n.added)}`, `- Removed: ${list(n.removed)}`] : ['- No earlier release to compare with.']),
    '',
    '## Licence',
    '',
    `${LICENCE_STATEMENT} (${LICENCE_URL})`,
    '',
    'Sources:',
    '',
    ...n.sources.map((s) => `- ${s.title}, ${s.publisher} (${s.homepage})`),
    '',
    'Contains no personal data: head teacher names and telephone numbers in GIAS are left out. Code and pipeline: https://github.com/rjnienaber/england_school_explorer',
    '',
  ];
  return lines.join('\n');
}

// ---------- The export ----------

export interface ExportResult {
  files: string[];
  schools: number;
  fields: number;
  added: string[];
  removed: string[];
}

/** Writes the release files into `outDir`, then checks them. Throws on anything wrong. */
export function exportRelease(opts: {
  storeFile: string;
  outDir: string;
  order: LoadedDimension[];
  sourceUrls: Record<string, string>;
  month: string;
  /** An earlier release's fields.csv, to list fields added and removed. */
  previousFields?: string | null;
}): ExportResult {
  const { storeFile, outDir, order, sourceUrls, month } = opts;

  // Fail before writing anything when a module declares something that looks like personal data
  const declared = order.flatMap((d) => [
    d.id,
    ...Object.keys(d.module.fields),
    ...Object.entries(d.module.extraTables ?? {}).flatMap(([t, def]) => [t, ...Object.keys(def.columns)]),
  ]);
  const personal = personalDataProblems(declared);
  if (personal.length) throw new Error(`Refusing to export personal data:\n  ${personal.join('\n  ')}`);

  // Read before the output folder is cleared: the file may be inside it
  let previousText: string | null = null;
  try {
    if (opts.previousFields) previousText = readFileSync(opts.previousFields, 'utf-8');
  } catch {
    // no earlier release (first run): the notes say so
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // 1. The SQLite file: VACUUM INTO copies the store compactly, then the release-only tables are added
  const sqliteFile = join(outDir, FILES.sqlite);
  const source = new DatabaseSync(storeFile, { readOnly: true });
  source.exec(`VACUUM INTO '${sqliteFile.replaceAll("'", "''")}'`);
  source.close();

  const db = new DatabaseSync(sqliteFile);
  try {
    db.exec('DROP TABLE IF EXISTS coverage');
    createWideView(db, order);
    const dictionary = buildDictionary(db, order, sourceUrls);
    db.exec('CREATE TABLE fields (field TEXT NOT NULL, "table" TEXT NOT NULL, label TEXT, description TEXT, type TEXT, unit TEXT, year_field TEXT, source_id TEXT, source_url TEXT, coverage INTEGER, PRIMARY KEY ("table", field))');
    insertAll(db, 'fields', FIELD_COLUMNS, dictionary as unknown as Record<string, unknown>[]);
    const sources = buildSources(order, sourceUrls);
    db.exec('CREATE TABLE sources (id TEXT PRIMARY KEY, title TEXT, publisher TEXT, homepage TEXT, url TEXT, fetched_at TEXT, licence TEXT, updated TEXT)');
    insertAll(db, 'sources', SOURCE_COLUMNS, sources as unknown as Record<string, unknown>[]);

    // 2. schools.csv from the wide view; booleans become true/false
    const columns = wideColumns(order);
    const types = new Map(order.flatMap((d) => Object.entries(d.module.fields)).map(([n, f]) => [n, f.type] as const));
    const wide = db.prepare('SELECT * FROM wide').all() as Record<string, unknown>[];
    const personalValues: string[] = [];
    const csvRows = wide.map((r) =>
      columns.map((c) => {
        const v = r[c];
        if (types.get(c) === 'boolean' && v !== null) return v === 1 ? 'true' : 'false';
        if (looksPersonalValue(v)) personalValues.push(`${c} of school ${String(r.urn)}`);
        return v;
      }),
    );
    if (personalValues.length) throw new Error(`Refusing to export personal data: ${personalValues.slice(0, 5).join(', ')} looks like an email address or telephone number`);
    writeFileSync(join(outDir, FILES.csv), toCsv(columns, csvRows));

    // 3. Dictionary and sources as CSV
    writeFileSync(join(outDir, FILES.fields), toCsv(FIELD_COLUMNS, dictionary.map((r) => FIELD_COLUMNS.map((c) => r[c]))));
    writeFileSync(join(outDir, FILES.sources), toCsv(SOURCE_COLUMNS, sources.map((r) => SOURCE_COLUMNS.map((c) => r[c]))));

    // 4. Notes
    const bySector: Record<string, number> = {};
    for (const r of db.prepare('SELECT sector, COUNT(*) AS n FROM schools GROUP BY sector ORDER BY n DESC').all() as { sector: string; n: number }[]) bySector[r.sector] = r.n;
    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(getMeta(db))) if (k.startsWith('metadata.')) metadata[k.slice('metadata.'.length)] = v;
    const key = (r: { table: string; field: string }) => `${r.table}.${r.field}`;
    const now = new Set(dictionary.map(key));
    let added: string[] = [];
    let removed: string[] = [];
    let hadPrevious = false;
    if (previousText !== null) {
      const before = new Set(parseCsv(previousText).map((r) => key({ table: r.table, field: r.field })));
      hadPrevious = before.size > 0;
      added = [...now].filter((k) => !before.has(k));
      removed = [...before].filter((k) => !now.has(k));
    }
    writeFileSync(join(outDir, FILES.notes), releaseNotes({ month, counts: { total: wide.length, bySector }, metadata, added, removed, hadPrevious, sources }));

    db.exec('VACUUM');
    const problems = verifyRelease(db, order, outDir);
    if (problems.length) throw new Error(`The release files are inconsistent:\n  ${problems.join('\n  ')}`);
    return { files: Object.values(FILES), schools: wide.length, fields: dictionary.length, added, removed };
  } finally {
    db.close();
  }
}

/** Cross-checks the files in `outDir` against each other. Returns problems; empty means consistent. */
export function verifyRelease(db: DatabaseSync, order: LoadedDimension[], outDir: string): string[] {
  const problems: string[] = [];
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const schools = count('SELECT COUNT(*) AS n FROM schools');
  const wide = count('SELECT COUNT(*) AS n FROM wide');
  if (wide !== schools) problems.push(`wide has ${wide} rows but schools has ${schools}`);

  const csv = parseCsv(readFileSync(join(outDir, FILES.csv), 'utf-8'));
  if (csv.length !== schools) problems.push(`schools.csv has ${csv.length} rows but schools has ${schools}`);
  const header = Object.keys(csv[0] ?? {});
  if (header.join() !== wideColumns(order).join()) problems.push('schools.csv header differs from the wide view columns');

  // every fields row is a real column of its table, and every wide column is described
  const wideCols = new Set((db.prepare('PRAGMA table_info(wide)').all() as { name: string }[]).map((c) => c.name));
  const dictionary = db.prepare('SELECT field, "table" AS tbl FROM fields').all() as { field: string; tbl: string }[];
  for (const { field, tbl } of dictionary) {
    const cols = (db.prepare(`PRAGMA table_info(${q(tbl)})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes(field)) problems.push(`fields lists ${tbl}.${field}, which is not a column`);
    if (tbl.startsWith('dim_') && !tbl.includes('__') && !wideCols.has(field)) problems.push(`fields lists ${field}, which is not a column of wide`);
  }
  const described = new Set(dictionary.map((d) => d.field));
  for (const c of wideCols) if (!described.has(c)) problems.push(`wide column ${c} is not in fields`);

  const allColumns = (db.prepare("SELECT m.name AS t, p.name AS c FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type IN ('table', 'view')").all() as { t: string; c: string }[]);
  problems.push(...personalDataProblems(allColumns.map((r) => r.c)).map((p) => `SQLite ${p}`));
  return problems;
}
