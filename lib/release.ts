// Turns the build stores into the files published as GitHub Release assets (see scripts/export-release.ts):
// schools.csv, england_schools.sqlite, fields.csv, sources.csv and NOTES.md, plus compressed copies:
// schools.csv.gz, england_schools.sqlite.gz and england_school_explorer-data.zip (all of the above in one download).
//
// Primary schools are separate files (primary_schools.csv, england_primary_schools.sqlite, primary_fields.csv and
// the .gz copies), not a `phase` column in the same table. The phases share 88 columns (identity, Ofsted, pupils,
// absence, spending...), but secondary has 125 of its own (key stage 4, sixth form, destinations) and primary 41 (key
// stage 2), so one table would have 254 columns with every row empty in a third to a half of them, and the existing
// secondary files would change shape under people already using them.
// The secondary file names and columns are unchanged. sources.csv and NOTES.md cover both phases.
//
// Everything is generic over the dimension modules: the CSV columns, the `wide` view and the data
// dictionary come from each module's `fields` and `extraTables`, so a new module needs no change here.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import type { FieldDef } from './dimension.ts';
import type { Phase } from './phase.ts';
import type { LoadedDimension } from './registry.ts';
import { extraTableName, getMeta, tableName } from './store.ts';
import { createZip, readZip } from './zip.ts';

export const LICENCE_STATEMENT = 'Contains public sector information licensed under the Open Government Licence v3.0.';
export const LICENCE_URL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

export const FILES = {
  csv: 'schools.csv',
  sqlite: 'england_schools.sqlite',
  fields: 'fields.csv',
  sources: 'sources.csv',
  notes: 'NOTES.md',
  csvGz: 'schools.csv.gz',
  sqliteGz: 'england_schools.sqlite.gz',
  zip: 'england_school_explorer-data.zip',
  primaryCsv: 'primary_schools.csv',
  primarySqlite: 'england_primary_schools.sqlite',
  primaryFields: 'primary_fields.csv',
  primaryCsvGz: 'primary_schools.csv.gz',
  primarySqliteGz: 'england_primary_schools.sqlite.gz',
} as const;

/** The per-phase files: the secondary names are the original ones. */
export interface PhaseFiles {
  csv: string;
  sqlite: string;
  fields: string;
  csvGz: string;
  sqliteGz: string;
}
export const PHASE_FILES: Record<Phase, PhaseFiles> = {
  secondary: { csv: FILES.csv, sqlite: FILES.sqlite, fields: FILES.fields, csvGz: FILES.csvGz, sqliteGz: FILES.sqliteGz },
  primary: { csv: FILES.primaryCsv, sqlite: FILES.primarySqlite, fields: FILES.primaryFields, csvGz: FILES.primaryCsvGz, sqliteGz: FILES.primarySqliteGz },
};

/** What the zip holds: every plain file, so one download is the whole release. */
export const ZIP_CONTENTS = [FILES.csv, FILES.sqlite, FILES.fields, FILES.sources, FILES.notes] as const;
/** The same with the primary files, when the release has them (after the secondary ones, so the original order holds). */
export const ZIP_CONTENTS_WITH_PRIMARY = [...ZIP_CONTENTS, FILES.primaryCsv, FILES.primarySqlite, FILES.primaryFields] as const;

/** "5.2 MB", "79 KB": sizes for the notes, in the decimal units GitHub shows. */
export function formatBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} bytes`;
}

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

/** One row per source, once even when both phases read it (GIAS, Ofsted). */
export function buildSources(order: LoadedDimension[], sourceUrls: Record<string, string>): SourceRow[] {
  const seen = new Set<string>();
  return order.flatMap((d) => d.sources).filter((s) => !seen.has(s.id) && seen.add(s.id)).map((s) => ({
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
  ks2Years: 'Key stage 2 results, years in the file',
  ks2Newest: 'Newest key stage 2 year',
  ofstedAsAt: 'Ofsted inspections as at',
};

/** What the notes say about one phase's files. */
export interface PhaseNotes {
  phase: Phase;
  counts: { total: number; bySector: Record<string, number> };
  metadata: Record<string, unknown>;
  added: string[];
  removed: string[];
  /** false when there was no earlier release to compare with */
  hadPrevious: boolean;
}

export interface NotesInput {
  month: string;
  /** Secondary first; primary only when the release has it. */
  phases: PhaseNotes[];
  sources: SourceRow[];
  /** Sizes in bytes of the files written before the notes (the notes and the zip, which holds them, are not listed). */
  sizes?: Partial<Record<keyof typeof FILES, number>>;
}

export function releaseNotes(n: NotesInput): string {
  const hasPrimary = n.phases.some((p) => p.phase === 'primary');
  const list = (items: string[]) => (items.length ? items.map((i) => `\`${i}\``).join(', ') : 'none');
  const size = (f: keyof typeof FILES) => (n.sizes?.[f] === undefined ? '' : ` (${formatBytes(n.sizes[f])})`);
  const counts = (p: PhaseNotes) => `${p.counts.total.toLocaleString('en-GB')}: ${Object.entries(p.counts.bySector).map(([s, c]) => `${c.toLocaleString('en-GB')} ${s}`).join(', ')}`;
  // Only the dates: the rest of the metadata (medians, model coefficients) is for the map, not for a data user
  const isDate = ([k, v]: [string, unknown]) => (k in DATE_LABELS || /Year$/.test(k)) && (typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string')));
  const dates = (p: PhaseNotes) => Object.entries(p.metadata).filter(isDate).map(([k, v]) => `- ${DATE_LABELS[k] ?? k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  // One list per phase; with both phases each gets a heading
  const phaseSections = (title: string, body: (p: PhaseNotes) => string[]) => [
    `## ${title}`,
    '',
    ...n.phases.flatMap((p) => (hasPrimary ? [`### ${p.phase === 'primary' ? 'Primary' : 'Secondary'} schools`, '', ...body(p), ''] : [...body(p), ''])),
  ];
  const lines = [
    `# Data ${n.month}`,
    '',
    hasPrimary
      ? `Every in-scope school in England, secondary (${counts(n.phases[0])}) and primary (${counts(n.phases[1])}), joined from the sources below by URN.`
      : `Every in-scope secondary school in England (${counts(n.phases[0])}), joined from the sources below by URN.`,
    '',
    '## Files',
    '',
    `- \`${FILES.csv}\`${size('csv')}: one row per secondary school, the latest value of every field (UTF-8 with a BOM, so Excel shows accents correctly).`,
    `- \`${FILES.sqlite}\`${size('sqlite')}: SQLite. \`schools\`, one \`dim_<module>\` table per dimension, long-format tables (\`dim_<module>__<name>\`), a \`wide\` view joining all of them (the same as the CSV), and the \`fields\` and \`sources\` tables.`,
    `- \`${FILES.fields}\`${size('fields')}: the data dictionary: every column with its label, description, type, unit, source and how many schools have a value.`,
    ...(hasPrimary
      ? [
          `- \`${FILES.primaryCsv}\`${size('primaryCsv')}, \`${FILES.primarySqlite}\`${size('primarySqlite')} and \`${FILES.primaryFields}\`${size('primaryFields')}: the same three files for primary schools. They are separate files, not a \`phase\` column, because the phases measure different things: they share most identity, Ofsted, pupil and spending columns, but secondary also has key stage 4 results (Attainment 8, Progress 8, sixth form, destinations) and primary has key stage 2 results (expected and higher standard, scaled scores, progress for 2022/23 only), so one table would be full of empty columns. No school is in both files, and the shared columns (\`urn\`, \`name\`, \`la\`, Ofsted...) have the same names, so you can stack the two if you want one table.`,
        ]
      : []),
    `- \`${FILES.sources}\`${size('sources')}: where each source was downloaded from, and when (both phases).`,
    `- \`${FILES.csvGz}\`${size('csvGz')}${hasPrimary ? ` and \`${FILES.primaryCsvGz}\`${size('primaryCsvGz')}` : ''}: the CSV${hasPrimary ? ' files' : ''}, gzip-compressed. pandas, DuckDB, R and Polars read ${hasPrimary ? 'them' : 'it'} directly.`,
    `- \`${FILES.sqliteGz}\`${size('sqliteGz')}${hasPrimary ? ` and \`${FILES.primarySqliteGz}\`${size('primarySqliteGz')}` : ''}: the SQLite file${hasPrimary ? 's' : ''}, gzip-compressed. Unzip with \`gunzip\` before querying.`,
    `- \`${FILES.zip}\`: ${hasPrimary ? 'the six plain files above (secondary and primary) and this `NOTES.md`' : 'the four plain files above and this `NOTES.md`'}, in one download (without the \`.gz\` copies).`,
    '',
    `**Which file should I download?** Excel or Google Sheets: \`schools.csv\`${hasPrimary ? ' (secondary) or `primary_schools.csv`' : ''}. SQL, Datasette or DuckDB: \`england_schools.sqlite\`${hasPrimary ? ' or `england_primary_schools.sqlite`' : ''}. Slow connection, or reading the data from code: the \`.gz\` copies. Everything at once: the zip.`,
    '',
    'Empty (CSV) or NULL (SQLite) means no value: the school has no data, or DfE suppressed it. The original suppression codes (`c`, `z`, `x`, `low`) are not kept.',
    ...(hasPrimary ? ['', 'Primary caveats: a primary cohort is often 20 to 40 pupils, so a single year\'s percentage can move a lot from one year to the next; read `ks2Cohort` beside every result. KS2 progress scores are published for 2022/23 only (the 2023/24 and 2024/25 tests lacked a usable key stage 1 baseline).'] : []),
    '',
    ...phaseSections('Data as at', (p) => (dates(p).length ? dates(p) : ['- (none recorded)'])),
    ...phaseSections('Fields since the previous release', (p) => (p.hadPrevious ? [`- Added: ${list(p.added)}`, `- Removed: ${list(p.removed)}`] : ['- No earlier release to compare with.'])),
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
  /** Schools in the secondary files */
  schools: number;
  /** Schools in the primary files (0 without a primary store) */
  primarySchools: number;
  fields: number;
  added: string[];
  removed: string[];
}

/** One phase's store and modules. */
export interface PhaseInput {
  storeFile: string;
  order: LoadedDimension[];
  /** An earlier release's fields file for this phase (fields.csv or primary_fields.csv), to list fields added and removed. */
  previousFields?: string | null;
}

function readOptional(file: string | null | undefined): string | null {
  try {
    return file ? readFileSync(file, 'utf-8') : null;
  } catch {
    return null; // no earlier release (first run): the notes say so
  }
}

/** What exportPhase hands back: counts for the notes, and the dictionary and sources for the totals. */
interface PhaseResult extends PhaseNotes {
  dictionary: FieldRow[];
  sources: SourceRow[];
  schools: number;
}

/** Writes one phase's SQLite file, CSV, dictionary and compressed copies, then checks them. */
function exportPhase(phase: Phase, input: PhaseInput, outDir: string, sourceUrls: Record<string, string>, previousText: string | null): PhaseResult {
  const { storeFile, order } = input;
  const files = PHASE_FILES[phase];
  // 1. The SQLite file: VACUUM INTO copies the store compactly, then the release-only tables are added
  const sqliteFile = join(outDir, files.sqlite);
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

    // 2. The CSV from the wide view; booleans become true/false
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
    writeFileSync(join(outDir, files.csv), toCsv(columns, csvRows));
    db.exec('VACUUM'); // the SQLite file is final from here, so its size and compressed copy are too

    // 3. Dictionary as CSV
    writeFileSync(join(outDir, files.fields), toCsv(FIELD_COLUMNS, dictionary.map((r) => FIELD_COLUMNS.map((c) => r[c]))));

    // 4. Compressed copies (gzip is deterministic: Node writes no timestamp)
    writeFileSync(join(outDir, files.csvGz), gzipSync(readFileSync(join(outDir, files.csv)), { level: 9 }));
    writeFileSync(join(outDir, files.sqliteGz), gzipSync(readFileSync(sqliteFile), { level: 9 }));

    // 5. What the notes say
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

    const problems = verifyPhase(db, order, outDir, files);
    if (problems.length) throw new Error(`The ${phase} release files are inconsistent:\n  ${problems.join('\n  ')}`);
    return { phase, counts: { total: wide.length, bySector }, metadata, added, removed, hadPrevious, dictionary, sources, schools: wide.length };
  } finally {
    db.close();
  }
}

/** Writes the release files into `outDir`, then checks them. Throws on anything wrong. */
export function exportRelease(opts: {
  /** The secondary store and modules; `storeFile`, `order` and `previousFields` are shorthand for this. */
  storeFile: string;
  outDir: string;
  order: LoadedDimension[];
  sourceUrls: Record<string, string>;
  month: string;
  /** An earlier release's fields.csv, to list fields added and removed. */
  previousFields?: string | null;
  /** The primary store and modules; without it the release has secondary files only. */
  primary?: PhaseInput;
}): ExportResult {
  const { storeFile, outDir, order, sourceUrls, month, primary } = opts;

  // Fail before writing anything when a module declares something that looks like personal data
  const declared = [...order, ...(primary?.order ?? [])].flatMap((d) => [
    d.id,
    ...Object.keys(d.module.fields),
    ...Object.entries(d.module.extraTables ?? {}).flatMap(([t, def]) => [t, ...Object.keys(def.columns)]),
  ]);
  const personal = personalDataProblems(declared);
  if (personal.length) throw new Error(`Refusing to export personal data:\n  ${personal.join('\n  ')}`);

  // Read before the output folder is cleared: the files may be inside it
  const previousSecondary = readOptional(opts.previousFields);
  const previousPrimary = readOptional(primary?.previousFields);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const secondary = exportPhase('secondary', { storeFile, order }, outDir, sourceUrls, previousSecondary);
  const primaryResult = primary ? exportPhase('primary', primary, outDir, sourceUrls, previousPrimary) : null;
  const phases = primaryResult ? [secondary, primaryResult] : [secondary];

  // sources.csv covers both phases (GIAS and Ofsted are read by both, listed once)
  const sources = buildSources([...order, ...(primary?.order ?? [])], sourceUrls);
  writeFileSync(join(outDir, FILES.sources), toCsv(SOURCE_COLUMNS, sources.map((r) => SOURCE_COLUMNS.map((c) => r[c]))));

  const sizeOf = (file: string) => statSync(join(outDir, file)).size;
  const sizes: Partial<Record<keyof typeof FILES, number>> = {
    csv: sizeOf(FILES.csv), sqlite: sizeOf(FILES.sqlite), fields: sizeOf(FILES.fields), sources: sizeOf(FILES.sources), csvGz: sizeOf(FILES.csvGz), sqliteGz: sizeOf(FILES.sqliteGz),
  };
  if (primaryResult) {
    sizes.primaryCsv = sizeOf(FILES.primaryCsv);
    sizes.primarySqlite = sizeOf(FILES.primarySqlite);
    sizes.primaryFields = sizeOf(FILES.primaryFields);
    sizes.primaryCsvGz = sizeOf(FILES.primaryCsvGz);
    sizes.primarySqliteGz = sizeOf(FILES.primarySqliteGz);
  }
  writeFileSync(join(outDir, FILES.notes), releaseNotes({ month, phases, sources, sizes }));

  // The zip of every plain file, last because it holds the notes
  const zipNames = primaryResult ? ZIP_CONTENTS_WITH_PRIMARY : ZIP_CONTENTS;
  writeFileSync(join(outDir, FILES.zip), createZip(zipNames.map((name) => ({ name, data: readFileSync(join(outDir, name)) }))));
  const zipProblems = verifyZip(outDir, zipNames);
  if (zipProblems.length) throw new Error(`The release files are inconsistent:\n  ${zipProblems.join('\n  ')}`);

  const written = [FILES.csv, FILES.sqlite, FILES.fields, FILES.sources, FILES.notes, FILES.csvGz, FILES.sqliteGz, FILES.zip, ...(primaryResult ? [FILES.primaryCsv, FILES.primarySqlite, FILES.primaryFields, FILES.primaryCsvGz, FILES.primarySqliteGz] : [])];
  return {
    files: written,
    schools: secondary.schools,
    primarySchools: primaryResult?.schools ?? 0,
    fields: secondary.dictionary.length + (primaryResult?.dictionary.length ?? 0),
    added: phases.flatMap((p) => p.added),
    removed: phases.flatMap((p) => p.removed),
  };
}

/** The zip holds exactly the plain files, byte for byte. Returns problems; empty means consistent. */
export function verifyZip(outDir: string, expected: readonly string[]): string[] {
  const problems: string[] = [];
  const zipped = readZip(readFileSync(join(outDir, FILES.zip)));
  if (zipped.map((e) => e.name).join() !== expected.join()) problems.push(`${FILES.zip} holds ${zipped.map((e) => e.name).join(', ')}, expected ${expected.join(', ')}`);
  for (const e of zipped) if (!readFileSync(join(outDir, e.name)).equals(e.data)) problems.push(`${e.name} in ${FILES.zip} differs from the file`);
  return problems;
}

/** Cross-checks one phase's files in `outDir` against each other. Returns problems; empty means consistent. */
export function verifyPhase(db: DatabaseSync, order: LoadedDimension[], outDir: string, files: PhaseFiles = PHASE_FILES.secondary): string[] {
  const problems: string[] = [];
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const schools = count('SELECT COUNT(*) AS n FROM schools');
  const wide = count('SELECT COUNT(*) AS n FROM wide');
  if (wide !== schools) problems.push(`wide has ${wide} rows but schools has ${schools}`);

  const csv = parseCsv(readFileSync(join(outDir, files.csv), 'utf-8'));
  if (csv.length !== schools) problems.push(`${files.csv} has ${csv.length} rows but schools has ${schools}`);
  const header = Object.keys(csv[0] ?? {});
  if (header.join() !== wideColumns(order).join()) problems.push(`${files.csv} header differs from the wide view columns`);

  // the compressed copies hold exactly the plain files
  const same = (a: Buffer, file: string) => a.equals(readFileSync(join(outDir, file)));
  if (!same(gunzipSync(readFileSync(join(outDir, files.csvGz))), files.csv)) problems.push(`${files.csvGz} does not decompress to ${files.csv}`);
  if (!same(gunzipSync(readFileSync(join(outDir, files.sqliteGz))), files.sqlite)) problems.push(`${files.sqliteGz} does not decompress to ${files.sqlite}`);

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
