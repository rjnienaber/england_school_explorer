// Runs every dimension module (dimensions/*/build.ts) into the SQLite store
// build/schools.sqlite, then writes the site's data files to dist/data/ from it:
// core.json, modes/<field>.json, details/<n>.json and manifest.json.
//
// Usage: node scripts/build-data.ts

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { exportData, writeData } from '../lib/export-data.ts';
import { generateAll } from '../lib/generate.ts';
import { DIST_DIR, STORE_FILE } from '../lib/paths.ts';
import { buildStore, readSourceUrls } from '../lib/pipeline.ts';
import { loadBuildOrder } from '../lib/registry.ts';
import { verifyData } from '../lib/verify-data.ts';

const order = await loadBuildOrder();
await generateAll(order);

console.log(`Building ${order.length} dimensions: ${order.map((d) => d.id).join(', ')}`);
const { db, scope, warnings } = await buildStore(order);

const dataDir = join(DIST_DIR, 'data');
const exported = await exportData(db, order, readSourceUrls());
const manifest = await writeData(dataDir, exported);
// The data used to be one file; make sure a stale copy isn't deployed next to the new ones
await rm(join(DIST_DIR, 'schools.geojson'), { force: true });

const verified = verifyData(db, order, dataDir);
db.close();
if (verified.problems.length) {
  console.error(`Data files do not match the store:\n  ${verified.problems.join('\n  ')}`);
  process.exit(1);
}

const records = exported.records;
const count = (pred: (p: Record<string, unknown>) => boolean) => records.filter(pred).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Wrote ${scope.all.length} schools → ${dataDir} (store: ${STORE_FILE}), build ${manifest.buildId}`);
console.log(
  `  state ${count((p) => p.sector === 'state')}, independent ${count((p) => p.sector === 'independent')}, ` +
    `with Att8 ${count((p) => p.att8 !== null)}, with P8 ${count((p) => p.p8 !== null)}, ` +
    `report card ${count((p) => p.ofstedFramework === 'report-card')}, OEIF ${count((p) => p.ofstedFramework === 'oeif')}`,
);
const t = manifest.totals;
console.log(
  `  size (gzip): core ${kb(t.coreGzip)}, largest mode column ${kb(t.modeMaxGzip)}, largest popup shard ${kb(t.detailMaxGzip)}; ` +
    `all ${manifest.files.length} files ${kb(t.allGzip)} (${kb(t.allRaw)} raw)`,
);
console.log(`  verified: every value in the files matches the store (${verified.values.toLocaleString()} values)`);
for (const w of exported.warnings) console.warn(`  NOTE ${w}`);
if (warnings.length) console.log(`  ${warnings.length} coverage warning(s), see above`);
