// Helper for dimensions/*/test.ts: builds a module (and the modules it depends on) from the small
// CSV extracts committed in dimensions/<id>/fixtures/, into a throwaway store. No data/ and no
// full build needed, so tests run in CI before the (slow, cached) fetch.
//
// A source's fixture is dimensions/<owner>/fixtures/<file>, where <owner> is the module whose
// source.ts defines it and <file> is the name `npm run fetch` would give it (data/<id>.csv).

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Fields } from './dimension.ts';
import { buildStore } from './pipeline.ts';
import { loadBuildOrder, type LoadedDimension } from './registry.ts';
import { readExtraRows, readModuleRows } from './store.ts';

export interface FixtureBuild {
  /** One module's rows by URN, decoded as the browser build sees them. */
  rows(moduleId: string): Map<number, Record<string, unknown>>;
  extra(moduleId: string, table: string): Record<string, unknown>[];
  /** The in-scope URNs (gias-core output). */
  urns: number[];
  metadata: Record<string, unknown>;
}

/** The module, the modules it reads and the scope module, still in build order. */
function closure(order: LoadedDimension[], id: string): LoadedDimension[] {
  const byId = new Map(order.map((d) => [d.id, d]));
  if (!byId.has(id)) throw new Error(`no dimension "${id}"`);
  const needed = new Set<string>();
  const visit = (x: string) => {
    if (needed.has(x)) return;
    needed.add(x);
    for (const dep of byId.get(x)!.module.dependsOn ?? []) visit(dep);
  };
  visit(id);
  for (const d of order) if (d.module.scope) needed.add(d.id);
  return order.filter((d) => needed.has(d.id));
}

const cache = new Map<string, Promise<FixtureBuild>>();

/**
 * Builds `moduleId` from fixtures. Memoised per test file, so call it freely in every test:
 * `const { rows } = await buildFromFixtures('my-module')`.
 */
export function buildFromFixtures(moduleId: string): Promise<FixtureBuild> {
  let build = cache.get(moduleId);
  if (!build) {
    build = run(moduleId);
    cache.set(moduleId, build);
  }
  return build;
}

/** Where each source's fixture file is, and the options that make buildStore read them. */
function fixtureOptions(everything: LoadedDimension[], storeFile: string) {
  // The scope module reads ks4.csv without depending on its owner, so fixtures are found for every source
  const owner = new Map(everything.flatMap((d) => d.sources.map((s) => [s.id, d.dir] as const)));
  return {
    storeFile,
    minSchools: 1,
    log: () => {},
    moreSources: everything.flatMap((d) => d.sources),
    dataFile: (def: { id: string; file?: string }) => {
      const file = join(owner.get(def.id)!, 'fixtures', def.file ?? `${def.id}.csv`);
      if (!existsSync(file)) throw new Error(`missing test fixture ${file}`);
      return file;
    },
  };
}

/**
 * Builds every module from fixtures into a store file inside a temporary folder, for tests of
 * things that read the whole store (the release export). Call `dispose()` when done.
 */
export async function buildFixtureStore(): Promise<{ storeFile: string; order: LoadedDimension[]; dir: string; dispose(): void }> {
  const order = await loadBuildOrder();
  const dir = mkdtempSync(join(tmpdir(), 'fixture-store-'));
  const storeFile = join(dir, 'schools.sqlite');
  try {
    (await buildStore(order, fixtureOptions(order, storeFile))).db.close();
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return { storeFile, order, dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

async function run(moduleId: string): Promise<FixtureBuild> {
  const everything = await loadBuildOrder();
  const order = closure(everything, moduleId);
  const dir = mkdtempSync(join(tmpdir(), 'fixture-store-'));
  try {
    const { db, scope, metadata } = await buildStore(order, fixtureOptions(everything, join(dir, 'schools.sqlite')));
    const fields = new Map(order.map((d) => [d.id, d.module] as const));
    // Read everything now so the store can be removed straight away
    const rows = new Map(order.map((d) => [d.id, readModuleRows(db, d.id, d.module.fields as Fields)]));
    const extra = new Map<string, Record<string, unknown>[]>();
    for (const d of order) {
      for (const table of Object.keys(d.module.extraTables ?? {})) extra.set(`${d.id}/${table}`, readExtraRows(db, d.id, table));
    }
    db.close();
    return {
      rows: (id) => {
        const r = rows.get(id);
        if (!r) throw new Error(`${id} was not built (is it in dependsOn of ${moduleId}? known: ${[...fields.keys()].join(', ')})`);
        return r;
      },
      extra: (id, table) => extra.get(`${id}/${table}`) ?? [],
      urns: scope.all.map((s) => s.urn),
      metadata,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
