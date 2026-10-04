// Checks that dist/data (core + modes + details) reconstructs to exactly what is in the build
// store. build:data runs this automatically; run it alone after editing the data by hand.
//
// Usage: node scripts/verify-data.ts

import { dataDirFor, storeFileFor } from '../lib/paths.ts';
import { PHASES } from '../lib/phase.ts';
import { forPhase, loadBuildOrder } from '../lib/registry.ts';
import { openStore } from '../lib/store.ts';
import { verifyData } from '../lib/verify-data.ts';

const all = await loadBuildOrder();
let ok = true;
for (const phase of PHASES) {
  const db = openStore(storeFileFor(phase));
  if (!db) {
    console.error(`No ${phase} build store: run npm run build:data first.`);
    process.exit(2);
  }
  const result = verifyData(db, forPhase(all, phase), dataDirFor(phase));
  console.log(`[${phase}] Verified ${result.schools} schools (${result.values.toLocaleString()} values): ${result.problems.length === 0 ? 'identical to the store' : 'PROBLEMS'}`);
  for (const p of result.problems) console.log(`  ${p}`);
  ok &&= result.problems.length === 0;
}
process.exit(ok ? 0 : 1);
