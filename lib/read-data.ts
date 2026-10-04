// Reads a published data folder (dist/data) back into complete per-school records, using the
// same decoding as the browser. Used to verify the export and to compare builds.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { columnPath, decodeColumn, decodeUrns, missingValue, shardOf, shardPath, type ColumnFile, type CoreFile, type DetailFile, type Value } from './columnar.ts';

export interface DataFolder {
  core: CoreFile;
  /** Every field of every school, including `urn`, in core's order. */
  records: Record<string, Value>[];
  lngLat: [number, number][];
  /** Problems found while reading, e.g. a file from another build. */
  problems: string[];
}

const readJson = <T>(dir: string, path: string) => JSON.parse(readFileSync(join(dir, path), 'utf-8')) as T;

export function readDataFolder(dir: string): DataFolder {
  const problems: string[] = [];
  const core = readJson<CoreFile>(dir, 'core.json');
  const checkId = (path: string, id: string) => id !== core.buildId && problems.push(`${path}: buildId ${id} is not core's ${core.buildId}`);

  const urns = decodeUrns(core);
  const records: Record<string, Value>[] = urns.map((urn) => ({ urn }));
  const fill = (name: string, values: Value[]) => {
    if (values.length !== core.count) problems.push(`${name}: ${values.length} values for ${core.count} schools`);
    values.forEach((v, i) => (records[i][name] = v));
  };

  for (const [name, f] of Object.entries(core.fields)) {
    if (f.placement === 'core') fill(name, decodeColumn(f, core.columns[name]));
    else if (f.placement === 'mode') {
      const file = readJson<ColumnFile>(dir, columnPath(name));
      checkId(columnPath(name), file.buildId);
      fill(name, decodeColumn(f, file.values));
    }
  }

  // Shards hold every non-core field. Detail fields come only from there; mode fields are also
  // in their columns, and the two must agree
  const shardNames = Object.keys(core.fields).filter((n) => core.fields[n].placement !== 'core');
  const byUrn = new Map(records.map((r) => [r.urn as number, r]));
  for (let shard = 0; shard < core.shards; shard++) {
    const file = readJson<DetailFile>(dir, shardPath(shard));
    checkId(shardPath(shard), file.buildId);
    for (const [urnKey, values] of Object.entries(file.schools)) {
      const urn = Number(urnKey);
      const record = byUrn.get(urn);
      if (!record) problems.push(`${shardPath(shard)}: unknown urn ${urn}`);
      else if (shardOf(urn, core.shards) !== shard) problems.push(`${shardPath(shard)}: urn ${urn} belongs in shard ${shardOf(urn, core.shards)}`);
      else {
        for (const n of shardNames) {
          const v = n in values ? values[n] : missingValue(core.fields[n]);
          if (core.fields[n].placement === 'detail') record[n] = v;
          else if (record[n] !== v) problems.push(`${shardPath(shard)}: urn ${urn} ${n} is ${JSON.stringify(v)} but its column has ${JSON.stringify(record[n])}`);
        }
      }
    }
  }
  for (const r of records) for (const n of shardNames) if (!(n in r)) problems.push(`urn ${r.urn}: no detail entry for ${n}`);

  return { core, records, lngLat: core.lng.map((lng, i) => [lng, core.lat[i]]), problems };
}

/** The old schools.geojson shape, for comparing against a build from before the data was split. */
export function toGeojson(folder: DataFolder) {
  return {
    type: 'FeatureCollection',
    metadata: folder.core.metadata,
    features: folder.records.map((properties, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: folder.lngLat[i] },
      properties,
    })),
  };
}
