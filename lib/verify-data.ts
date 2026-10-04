// Proves dist/data says exactly what the store says: reads the files back like the browser
// does, rebuilds every school, and compares each field with the store.

import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from './export-data.ts';
import type { LoadedDimension } from './registry.ts';
import { getMeta, readModuleRows } from './store.ts';
import { readDataFolder } from './read-data.ts';

export interface VerifyResult {
  schools: number;
  values: number;
  problems: string[];
}

export function verifyData(db: DatabaseSync, order: LoadedDimension[], dataDir: string): VerifyResult {
  const folder = readDataFolder(dataDir);
  const problems = [...folder.problems];
  const fail = (message: string) => problems.push(message);

  const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf-8')) as Manifest;
  if (manifest.buildId !== folder.core.buildId) fail(`manifest.json: buildId ${manifest.buildId} is not core's ${folder.core.buildId}`);
  if (manifest.files.length !== 1 + Object.values(folder.core.fields).filter((f) => f.placement === 'mode').length + folder.core.shards) {
    fail('manifest.json does not list every file');
  }

  const stored = db.prepare('SELECT urn, lng, lat FROM schools').all() as { urn: number; lng: number; lat: number }[];
  const byUrn = new Map(folder.records.map((r, i) => [r.urn as number, { record: r, at: folder.lngLat[i] }]));
  if (stored.length !== folder.records.length) fail(`${folder.records.length} schools in the files, ${stored.length} in the store`);

  const tables = order.map((d) => ({ fields: d.module.fields, rows: readModuleRows(db, d.id, d.module.fields) }));
  let values = 0;
  for (const s of stored) {
    const got = byUrn.get(s.urn);
    if (!got) {
      fail(`urn ${s.urn}: in the store but not the files`);
      continue;
    }
    if (got.at[0] !== s.lng || got.at[1] !== s.lat) fail(`urn ${s.urn}: location ${got.at} is not ${s.lng},${s.lat}`);
    for (const { fields, rows } of tables) {
      const row = rows.get(s.urn);
      for (const [name, f] of Object.entries(fields)) {
        const v = row ? row[name] : undefined;
        const want = v === null || v === undefined ? (f.nullable === false ? f.default : null) : v;
        values++;
        if (got.record[name] !== want) fail(`urn ${s.urn}: ${name} is ${JSON.stringify(got.record[name])}, store has ${JSON.stringify(want)}`);
      }
    }
  }

  const meta = getMeta(db);
  const { metadata } = folder.core;
  if (metadata.builtAt !== meta.builtAt) fail('metadata.builtAt differs from the store');
  for (const [key, value] of Object.entries(meta)) {
    if (key.startsWith('metadata.') && JSON.stringify(metadata[key.slice(9)]) !== JSON.stringify(value)) fail(`${key} differs from the store`);
  }
  return { schools: stored.length, values, problems: problems.slice(0, 30).concat(problems.length > 30 ? [`...and ${problems.length - 30} more`] : []) };
}
