// Runs every dimension module (dimensions/*/build.ts) once per phase, into one SQLite store per phase,
// then writes each phase's data files from its store: core.json, modes/<field>.json, details/<n>.json and
// manifest.json. Secondary is written to dist/data/ (build/schools.sqlite), primary to dist/data/primary/
// (build/primary.sqlite). A module only runs for the phases it declares (`phases`, default secondary).
//
// Usage: node scripts/build-data.ts

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { exportData, writeData } from '../lib/export-data.ts';
import { generateAll } from '../lib/generate.ts';
import { DIST_DIR, dataDirFor, storeFileFor } from '../lib/paths.ts';
import { PHASES } from '../lib/phase.ts';
import { buildStore, readSourceUrls } from '../lib/pipeline.ts';
import { forPhase, loadBuildOrder } from '../lib/registry.ts';
import { verifyData } from '../lib/verify-data.ts';

const all = await loadBuildOrder();
await generateAll(all);

let failed = false;
// Secondary is written first: it owns dist/data/, which writeData empties before writing
for (const phase of PHASES) {
  const order = forPhase(all, phase);
  console.log(`\n[${phase}] Building ${order.length} dimensions: ${order.map((d) => d.id).join(', ')}`);
  const { db, scope, warnings } = await buildStore(order, { phase });

  const dataDir = dataDirFor(phase);
  const exported = await exportData(db, order, readSourceUrls(), phase);
  const manifest = await writeData(dataDir, exported);
  // The data used to be one file; make sure a stale copy isn't deployed next to the new ones
  if (phase === PHASES[0]) await rm(join(DIST_DIR, 'schools.geojson'), { force: true });

  const verified = verifyData(db, order, dataDir);
  db.close();
  if (verified.problems.length) {
    console.error(`[${phase}] Data files do not match the store:\n  ${verified.problems.join('\n  ')}`);
    failed = true;
    continue;
  }

  const records = exported.records;
  const count = (pred: (p: Record<string, unknown>) => boolean) => records.filter(pred).length;
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`[${phase}] Wrote ${scope.all.length} schools → ${dataDir} (store: ${storeFileFor(phase)}), build ${manifest.buildId}`);
  console.log(
    `  state ${count((p) => p.sector === 'state')}, independent ${count((p) => p.sector === 'independent')}, ` +
      (phase === 'secondary' ? `with Att8 ${count((p) => p.att8 !== null)}, with P8 ${count((p) => p.p8 !== null)}, ` : '') +
      `report card ${count((p) => p.ofstedFramework === 'report-card')}, OEIF ${count((p) => p.ofstedFramework === 'oeif')}`,
  );
  const t = manifest.totals;
  console.log(
    `  size (gzip): core ${kb(t.coreGzip)} (${kb(t.coreRaw)} raw), largest mode column ${kb(t.modeMaxGzip)}, largest popup shard ${kb(t.detailMaxGzip)}; ` +
      `all ${manifest.files.length} files ${kb(t.allGzip)} (${kb(t.allRaw)} raw)`,
  );
  console.log(`  verified: every value in the files matches the store (${verified.values.toLocaleString()} values)`);
  for (const w of exported.warnings) console.warn(`  NOTE ${w}`);
  if (warnings.length) console.log(`  ${warnings.length} coverage warning(s), see above`);
}
if (failed) process.exit(1);
