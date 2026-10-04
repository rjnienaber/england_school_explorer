import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { buildFixtureStore } from './test-fixtures.ts';
import { csvCell, exportRelease, FILES, looksPersonalValue, parseCsv, personalDataProblems, toCsv } from './release.ts';
import { loadBuildOrder } from './registry.ts';

test('csv: quoting, empty values and the BOM', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(0), '0');
  const text = toCsv(['a', 'b'], [[1, 'x,y'], [null, 'é']]);
  assert.ok(text.startsWith('﻿a,b\r\n'));
  assert.deepEqual(parseCsv(text), [{ a: '1', b: 'x,y' }, { a: '', b: 'é' }]);
});

// ---- Personal data: GIAS has head teacher names and telephone numbers, which must never be published ----

test('personal data denylist catches the GIAS personal columns and common variants', () => {
  const personal = ['HeadTitle (name)', 'HeadFirstName', 'HeadLastName', 'HeadPreferredJobTitle', 'TelephoneNum', 'headTeacher', 'phone', 'contactEmail', 'email', 'PropsName', 'proprietorName', 'surname', 'dateOfBirth'];
  for (const name of personal) assert.equal(personalDataProblems([name]).length > 0, true, name);
  const fine = ['name', 'la', 'town', 'postcode', 'website', 'trust', 'p8', 'ks4Cohort', 'rcLeadership', 'ofstedUrl', 'att8Disadvantaged', 'headline'];
  for (const name of fine) assert.deepEqual(personalDataProblems([name]), [], name);
});

test('no module declares a personal-data field, table or column', async () => {
  const order = await loadBuildOrder();
  const names = order.flatMap((d) => [
    d.id,
    ...Object.keys(d.module.fields),
    ...Object.entries(d.module.extraTables ?? {}).flatMap(([table, def]) => [table, ...Object.keys(def.columns)]),
  ]);
  assert.ok(names.length > 30);
  assert.deepEqual(personalDataProblems(names), []);
});

test('values that are emails or UK phone numbers are caught; dates and URNs are not', () => {
  assert.equal(looksPersonalValue('head@school.example.org'), true);
  assert.equal(looksPersonalValue('020 7946 0958'), true);
  assert.equal(looksPersonalValue('+44 20 7946 0958'), true);
  assert.equal(looksPersonalValue('2025-01-29'), false);
  assert.equal(looksPersonalValue('100049'), false);
  assert.equal(looksPersonalValue('https://www.example.org/'), false);
  assert.equal(looksPersonalValue(null), false);
});

test('the export refuses a store whose module declares a personal-data field', async () => {
  const { storeFile, order, dispose } = await buildFixtureStore();
  const out = mkdtempSync(join(tmpdir(), 'release-test-'));
  try {
    const bad = [...order];
    bad[1] = { ...bad[1], module: { ...bad[1].module, fields: { ...bad[1].module.fields, headTeacherName: { type: 'string', placement: 'detail', label: 'Head teacher' } } } };
    assert.throws(() => exportRelease({ storeFile, outDir: out, order: bad, sourceUrls: {}, month: '2026-10' }), /personal data/);
  } finally {
    rmSync(out, { recursive: true, force: true });
    dispose();
  }
});

// ---- The export, from fixtures ----

test('release export: files agree with each other and with the module declarations', async () => {
  const { storeFile, order, dispose } = await buildFixtureStore();
  const out = mkdtempSync(join(tmpdir(), 'release-test-'));
  try {
    const previous = join(out, 'previous-fields.csv');
    writeFileSync(previous, toCsv(['field', 'table'], [['oldField', 'dim_gias-core'], ['name', 'dim_gias-core']]));
    const outDir = join(out, 'release');
    const result = exportRelease({ storeFile, outDir, order, sourceUrls: { gias: 'https://example.org/gias.csv', fetchedAt: '2026-10-03T00:00:00Z' }, month: '2026-10', previousFields: previous });

    const db = new DatabaseSync(join(outDir, FILES.sqlite), { readOnly: true });
    const schools = (db.prepare('SELECT COUNT(*) AS n FROM schools').get() as { n: number }).n;
    assert.ok(schools >= 10);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM wide').get() as { n: number }).n, schools);

    // CSV: one row per school, header = wide columns, booleans as true/false, accents and commas intact
    const csv = parseCsv(readFileSync(join(outDir, FILES.csv), 'utf-8'));
    assert.equal(csv.length, schools);
    assert.equal(new Set(csv.map((r) => r.urn)).size, schools);
    assert.deepEqual(Object.keys(csv[0]), (db.prepare('PRAGMA table_info(wide)').all() as { name: string }[]).map((c) => c.name));
    assert.ok(csv.every((r) => r.sixthForm === 'true' || r.sixthForm === 'false'));
    assert.ok(readFileSync(join(outDir, FILES.csv), 'utf-8').startsWith('﻿urn,'));

    // every declared field is documented, and exists as a column of its table
    const dictionary = parseCsv(readFileSync(join(outDir, FILES.fields), 'utf-8'));
    for (const d of order) {
      for (const [name, f] of Object.entries(d.module.fields)) {
        const row = dictionary.find((r) => r.field === name && r.table === `dim_${d.id}`);
        assert.ok(row, `${name} is in fields.csv`);
        assert.equal(row.label, f.label);
        if (f.description) assert.ok(row.description.includes(f.description.replace(/\.$/, '')), `${name} description`);
        const columns = (db.prepare(`PRAGMA table_info("dim_${d.id}")`).all() as { name: string }[]).map((c) => c.name);
        assert.ok(columns.includes(name));
      }
      // extra tables are included automatically
      for (const [table, def] of Object.entries(d.module.extraTables ?? {})) {
        for (const column of Object.keys(def.columns)) assert.ok(dictionary.some((r) => r.table === `dim_${d.id}__${table}` && r.field === column), `${table}.${column}`);
      }
    }
    assert.equal(dictionary.length, (db.prepare('SELECT COUNT(*) AS n FROM fields').get() as { n: number }).n);
    // coverage is the non-null count
    const p8 = dictionary.find((r) => r.field === 'p8')!;
    assert.equal(Number(p8.coverage), (db.prepare('SELECT COUNT(p8) AS n FROM wide').get() as { n: number }).n);

    // sources, notes
    const sources = parseCsv(readFileSync(join(outDir, FILES.sources), 'utf-8'));
    assert.deepEqual(sources.map((s) => s.id).sort(), order.flatMap((d) => d.sources.map((s) => s.id)).sort());
    assert.equal(sources.find((s) => s.id === 'gias')!.url, 'https://example.org/gias.csv');
    const notes = readFileSync(join(outDir, FILES.notes), 'utf-8');
    assert.match(notes, /^# Data 2026-10/);
    assert.match(notes, /Contains public sector information licensed under the Open Government Licence v3\.0/);
    assert.match(notes, /Removed: `dim_gias-core\.oldField`/);
    assert.ok(result.added.includes('dim_ks4-headline.p8'));

    // no personal-data column anywhere in the SQLite file
    const columns = db.prepare("SELECT p.name AS c FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type IN ('table', 'view')").all() as { c: string }[];
    assert.deepEqual(personalDataProblems(columns.map((c) => c.c)), []);
    db.close();
  } finally {
    rmSync(out, { recursive: true, force: true });
    dispose();
  }
});
