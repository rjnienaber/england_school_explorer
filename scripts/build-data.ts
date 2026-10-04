// Runs every dimension module (dimensions/*/build.ts) into the SQLite store
// build/schools.sqlite, then writes dist/schools.geojson from it.
//
// Usage: node scripts/build-data.ts

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportGeojson } from '../lib/export-geojson.ts';
import { generateAll } from '../lib/generate.ts';
import { DIST_DIR, STORE_FILE } from '../lib/paths.ts';
import { buildStore, readSourceUrls } from '../lib/pipeline.ts';
import { loadBuildOrder } from '../lib/registry.ts';

const order = await loadBuildOrder();
await generateAll(order);

console.log(`Building ${order.length} dimensions: ${order.map((d) => d.id).join(', ')}`);
const { db, scope, warnings } = await buildStore(order);

await mkdir(DIST_DIR, { recursive: true });
const out = join(DIST_DIR, 'schools.geojson');
const collection = exportGeojson(db, order, readSourceUrls());
await writeFile(out, JSON.stringify(collection));
db.close();

const count = (pred: (p: Record<string, unknown>) => boolean) => collection.features.filter((f) => pred(f.properties)).length;
console.log(`Wrote ${scope.all.length} schools → ${out} (store: ${STORE_FILE})`);
console.log(
  `  state ${count((p) => p.sector === 'state')}, independent ${count((p) => p.sector === 'independent')}, ` +
    `with Att8 ${count((p) => p.att8 !== null)}, with P8 ${count((p) => p.p8 !== null)}, ` +
    `report card ${count((p) => p.ofstedFramework === 'report-card')}, OEIF ${count((p) => p.ofstedFramework === 'oeif')}`,
);
if (warnings.length) console.log(`  ${warnings.length} coverage warning(s), see above`);
