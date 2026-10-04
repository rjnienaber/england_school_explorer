// Writes the store out as dist/schools.geojson: one feature per in-scope school, with every
// module's fields as flat properties. (#31 will split this into core / mode / detail files.)

import type { DatabaseSync } from 'node:sqlite';
import type { Fields } from './dimension.ts';
import type { LoadedDimension } from './registry.ts';
import { getMeta, readModuleRows } from './store.ts';

export interface GeoFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

export interface GeoCollection {
  type: 'FeatureCollection';
  metadata: { builtAt: string; sources: Record<string, string> } & Record<string, unknown>;
  features: GeoFeature[];
}

/** Value a school gets from a module that has no row for it. */
function missingValue(f: Fields[string]): unknown {
  return f.nullable === false ? f.default : null;
}

export function exportGeojson(db: DatabaseSync, order: LoadedDimension[], sources: Record<string, string>): GeoCollection {
  const meta = getMeta(db);
  const tables = order.map((d) => ({ fields: d.module.fields, rows: readModuleRows(db, d.id, d.module.fields) }));
  const schools = db.prepare('SELECT urn, lng, lat FROM schools ORDER BY rowid').all() as { urn: number; lng: number; lat: number }[];

  const features: GeoFeature[] = schools.map((s) => {
    const properties: Record<string, unknown> = { urn: s.urn };
    for (const { fields, rows } of tables) {
      const row = rows.get(s.urn);
      for (const [name, f] of Object.entries(fields)) {
        const value = row ? row[name] : undefined;
        properties[name] = value === null || value === undefined ? missingValue(f) : value;
      }
    }
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties };
  });

  const metadata: GeoCollection['metadata'] = { builtAt: meta.builtAt as string, sources };
  for (const [key, value] of Object.entries(meta)) if (key.startsWith('metadata.')) metadata[key.slice('metadata.'.length)] = value;
  return { type: 'FeatureCollection', metadata, features };
}
