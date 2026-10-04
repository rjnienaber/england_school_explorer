// Checks that dist/data (core + modes + details) reconstructs to exactly what is in the build
// store. build:data runs this automatically; run it alone after editing the data by hand.
//
// Usage: node scripts/verify-data.ts

import { join } from 'node:path';
import { DIST_DIR } from '../lib/paths.ts';
import { loadBuildOrder } from '../lib/registry.ts';
import { openStore } from '../lib/store.ts';
import { verifyData } from '../lib/verify-data.ts';

const db = openStore();
if (!db) {
  console.error('No build store: run npm run build:data first.');
  process.exit(2);
}
const result = verifyData(db, await loadBuildOrder(), join(DIST_DIR, 'data'));
console.log(`Verified ${result.schools} schools (${result.values.toLocaleString()} values): ${result.problems.length === 0 ? 'identical to the store' : 'PROBLEMS'}`);
for (const p of result.problems) console.log(`  ${p}`);
process.exit(result.problems.length === 0 ? 0 : 1);
