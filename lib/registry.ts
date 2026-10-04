// Finds dimension modules (dimensions/<id>/), checks them and puts them in build order.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DimensionModule, SourceDef } from './dimension.ts';
import { DIMENSIONS_DIR } from './paths.ts';

export interface LoadedDimension {
  id: string;
  dir: string;
  module: DimensionModule;
  sources: SourceDef[];
  hasWeb: boolean;
}

const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9]*$/;
/** Property names the pipeline writes itself. */
const RESERVED_FIELDS = new Set(['urn']);

/** Imports every dimensions/<id>/ folder that has a build.ts. Folders starting with _ or . are skipped. */
export async function loadDimensions(root = DIMENSIONS_DIR): Promise<LoadedDimension[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const loaded: LoadedDimension[] = [];
  for (const entry of entries.filter((e) => e.isDirectory() && !/^[_.]/.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(root, entry.name);
    if (!existsSync(join(dir, 'build.ts'))) throw new Error(`dimensions/${entry.name}/ has no build.ts`);
    const built = (await import(pathToFileURL(join(dir, 'build.ts')).href)) as { module?: DimensionModule };
    if (!built.module) throw new Error(`dimensions/${entry.name}/build.ts must export "module" (a DimensionModule)`);
    let sources: SourceDef[] = [];
    if (existsSync(join(dir, 'source.ts'))) {
      const s = (await import(pathToFileURL(join(dir, 'source.ts')).href)) as { sources?: SourceDef[] };
      if (!s.sources) throw new Error(`dimensions/${entry.name}/source.ts must export "sources"`);
      sources = s.sources;
    }
    loaded.push({ id: entry.name, dir, module: built.module, sources, hasWeb: existsSync(join(dir, 'web.ts')) });
  }
  return loaded;
}

/** Throws one error listing everything wrong with the set of modules. */
export function validateDimensions(list: LoadedDimension[]): void {
  const problems: string[] = [];
  const ids = new Set(list.map((d) => d.id));
  const fieldOwner = new Map<string, string>();
  const sourceOwner = new Map<string, string>();
  const scopes = list.filter((d) => d.module.scope);
  if (scopes.length !== 1) problems.push(`exactly one module must set scope: true (found ${scopes.length})`);

  for (const d of list) {
    const { module: m } = d;
    const at = `dimensions/${d.id}`;
    if (m.id !== d.id) problems.push(`${at}: module.id is "${m.id}" but the folder is "${d.id}"`);
    if (!ID.test(d.id)) problems.push(`${at}: id must be lower-case letters, digits and single hyphens`);
    for (const dep of m.dependsOn ?? []) {
      if (!ids.has(dep)) problems.push(`${at}: dependsOn "${dep}", which is not a dimension`);
      if (dep === d.id) problems.push(`${at}: depends on itself`);
    }
    for (const s of d.sources) {
      const prev = sourceOwner.get(s.id);
      if (prev) problems.push(`${at}: source "${s.id}" is already defined by ${prev}`);
      sourceOwner.set(s.id, d.id);
    }
    for (const [name, f] of Object.entries(m.fields)) {
      if (!FIELD_NAME.test(name) || RESERVED_FIELDS.has(name)) problems.push(`${at}: invalid field name "${name}"`);
      const prev = fieldOwner.get(name);
      if (prev) problems.push(`${at}: field "${name}" is already declared by ${prev}; property names are global`);
      fieldOwner.set(name, d.id);
      if (f.type === 'enum' && f.values.length === 0) problems.push(`${at}: enum field "${name}" has no values`);
      if (f.nullable === false && f.default === undefined && !m.scope) {
        problems.push(`${at}: field "${name}" is not nullable, so it needs a default for schools without a row`);
      }
    }
    for (const [name, t] of Object.entries(m.extraTables ?? {})) {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) problems.push(`${at}: extra table name "${name}" must be lower_snake_case`);
      if ('urn' in t.columns) problems.push(`${at}: extra table "${name}" must not declare urn (it is added)`);
    }
  }
  for (const d of list) {
    for (const [name, f] of Object.entries(d.module.fields)) {
      const at = `dimensions/${d.id}`;
      if (f.year && !fieldOwner.has(f.year)) problems.push(`${at}: field "${name}" has year "${f.year}", which is not a declared field`);
      if (f.source && !sourceOwner.has(f.source)) problems.push(`${at}: field "${name}" names source "${f.source}", which no module defines`);
    }
  }
  if (problems.length) throw new Error(`Invalid dimension modules:\n  - ${problems.join('\n  - ')}`);
}

/**
 * Build order: the scope module first, then dependencies before dependents, ties broken
 * alphabetically so the output is stable. Fails clearly on a cycle.
 */
export function sortDimensions(list: LoadedDimension[]): LoadedDimension[] {
  const byId = new Map(list.map((d) => [d.id, d]));
  const deps = new Map<string, Set<string>>();
  const scope = list.find((d) => d.module.scope);
  for (const d of list) {
    const set = new Set(d.module.dependsOn ?? []);
    if (scope && d !== scope) set.add(scope.id);
    for (const dep of set) if (!byId.has(dep)) throw new Error(`${d.id} depends on unknown dimension "${dep}"`);
    deps.set(d.id, set);
  }
  const done = new Set<string>();
  const order: LoadedDimension[] = [];
  while (order.length < list.length) {
    const ready = list
      .filter((d) => !done.has(d.id) && [...deps.get(d.id)!].every((x) => done.has(x)))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (ready.length === 0) {
      const stuck = list.filter((d) => !done.has(d.id)).map((d) => d.id);
      throw new Error(`Dependency cycle between dimensions: ${stuck.join(', ')}`);
    }
    done.add(ready[0].id);
    order.push(ready[0]);
  }
  return order;
}

/** Loads, validates and sorts. */
export async function loadBuildOrder(root?: string): Promise<LoadedDimension[]> {
  const list = await loadDimensions(root);
  validateDimensions(list);
  return sortDimensions(list);
}
