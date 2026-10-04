// The browser's data layer. core.json (small) loads at start-up and holds every school's
// identity and position. Everything else loads on demand and is cached for the session:
//   ensureFields(fields)  the column of a `mode` field for all schools (modes, filters, list)
//   getDetails(urn)       the shard with every non-core field of ~32 schools (the popup)
// Files are requested as <file>?v=<buildId> and each carries that id, so a deploy that lands
// while the page is open can never mix old columns with new ones: positions only line up
// within one build.

import {
  columnPath,
  decodeColumn,
  decodeUrns,
  missingValue,
  shardOf,
  shardPath,
  type ColumnFile,
  type CoreFile,
  type DetailFile,
  type Value,
} from '../lib/columnar.ts';
import type { SchoolFeature, SchoolRecord } from './types.ts';

/** The data on the server changed while the page was open. */
export class StaleDataError extends Error {}

const RELOAD_KEY = 'schools-data-reload';

/** Reloads the page once so it picks up the new build; false if it already did so a moment ago. */
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (last && Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

export class SchoolData {
  readonly core: CoreFile;
  /** One per school, in core's order. `properties` holds only what has been loaded so far. */
  readonly features: SchoolFeature[];
  readonly byUrn = new Map<number, SchoolFeature>();
  private readonly urns: number[];
  private readonly loadedColumns = new Set<string>();
  private readonly loadedShards = new Set<number>();
  private readonly columnRequests = new Map<string, Promise<void>>();
  private readonly shardRequests = new Map<number, Promise<void>>();

  constructor(core: CoreFile) {
    this.core = core;
    this.urns = decodeUrns(core);
    const columns = Object.entries(core.columns).map(([name, values]) => [name, decodeColumn(core.fields[name], values)] as const);
    this.features = this.urns.map((urn, i) => {
      const properties: Record<string, Value> = { urn };
      for (const [name, values] of columns) properties[name] = values[i];
      const feature: SchoolFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [core.lng[i], core.lat[i]] },
        properties: properties as unknown as SchoolRecord,
      };
      this.byUrn.set(urn, feature);
      return feature;
    });
    for (const name of Object.keys(core.fields)) if (core.fields[name].placement === 'core') this.loadedColumns.add(name);
  }

  private async fetchFile<T extends { buildId: string }>(path: string): Promise<T> {
    const res = await fetch(`data/${path}?v=${this.core.buildId}`);
    if (!res.ok) throw new Error(`Couldn’t load ${path} (${res.status}).`);
    const body = (await res.json()) as T;
    if (body.buildId !== this.core.buildId) {
      const reloading = reloadOnce();
      throw new StaleDataError(reloading ? 'The data was updated. Reloading…' : 'The data was updated. Please refresh the page.');
    }
    return body;
  }

  /** Every field a mode or filter may read is a core or mode field (the build checks this). */
  hasFields(fields: Iterable<string>): boolean {
    for (const f of fields) if (this.core.fields[f]?.placement === 'mode' && !this.loadedColumns.has(f)) return false;
    return true;
  }

  hasDetails(urn: number): boolean {
    return this.loadedShards.has(shardOf(urn, this.core.shards));
  }

  /** Is this field's value available on this school's record? */
  hasField(field: string, urn: number): boolean {
    const info = this.core.fields[field];
    if (!info || info.placement === 'core') return true;
    return this.loadedShards.has(shardOf(urn, this.core.shards)) || (info.placement === 'mode' && this.loadedColumns.has(field));
  }

  /** Loads the missing mode columns, in parallel. Each is fetched once; a failed one can be retried. */
  ensureFields(fields: Iterable<string>): Promise<void> {
    const requests: Promise<void>[] = [];
    for (const name of new Set(fields)) {
      const info = this.core.fields[name];
      if (!info || info.placement === 'core' || this.loadedColumns.has(name)) continue;
      if (info.placement === 'detail') throw new Error(`"${name}" is a detail field: it only loads with a school's popup.`);
      let request = this.columnRequests.get(name);
      if (!request) {
        request = this.fetchFile<ColumnFile>(columnPath(name)).then(
          (file) => {
            const values = decodeColumn(info, file.values);
            this.features.forEach((f, i) => ((f.properties as unknown as Record<string, Value>)[name] = values[i]));
            this.loadedColumns.add(name);
          },
          (err: unknown) => {
            this.columnRequests.delete(name);
            throw err;
          },
        );
        this.columnRequests.set(name, request);
      }
      requests.push(request);
    }
    return Promise.all(requests).then(() => undefined);
  }

  /** Loads the shard holding this school (and ~32 neighbours by URN). Fills in every non-core field for them. */
  getDetails(urn: number): Promise<void> {
    const shard = shardOf(urn, this.core.shards);
    if (this.loadedShards.has(shard)) return Promise.resolve();
    let request = this.shardRequests.get(shard);
    if (!request) {
      const names = Object.keys(this.core.fields).filter((n) => this.core.fields[n].placement !== 'core');
      request = this.fetchFile<DetailFile>(shardPath(shard)).then(
        (file) => {
          for (const [urnKey, values] of Object.entries(file.schools)) {
            const properties = this.byUrn.get(Number(urnKey))?.properties as unknown as Record<string, Value> | undefined;
            if (!properties) continue;
            for (const n of names) properties[n] = n in values ? values[n] : missingValue(this.core.fields[n]);
          }
          this.loadedShards.add(shard);
        },
        (err: unknown) => {
          this.shardRequests.delete(shard);
          throw err;
        },
      );
      this.shardRequests.set(shard, request);
    }
    return request;
  }

  /** Fields the current mode and filter settings read. Falls back to every column if the build predates a mode or filter. */
  viewFields(modeId: string, filters: Record<string, boolean | string>): string[] {
    const { needs, fields } = this.core;
    const everything = () => Object.keys(fields).filter((n) => fields[n].placement !== 'detail');
    const out = new Set(needs.modes[modeId] ?? everything());
    for (const [id, value] of Object.entries(filters)) for (const f of needs.filters[id]?.[String(value)] ?? everything()) out.add(f);
    return [...out];
  }
}

export async function loadCore(): Promise<SchoolData> {
  // Revalidate every visit: core.json is the one file whose URL doesn't change between builds
  const res = await fetch('data/core.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn’t load the school data (${res.status}). Run npm run build first.`);
  return new SchoolData((await res.json()) as CoreFile);
}
