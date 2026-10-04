// Writes the files published as GitHub Release assets to release/ from the build store
// (build/schools.sqlite): schools.csv, england_schools.sqlite, fields.csv, sources.csv and NOTES.md.
// Run `npm run build:data` first. See lib/release.ts for what each file holds.
//
// Usage: node scripts/export-release.ts [--out release] [--month YYYY-MM] [--previous-fields <fields.csv>]
//   --month            the data month the release is named for (data-YYYY-MM). Default: this month (UTC).
//   --previous-fields  the previous release's fields.csv, to list fields added and removed in NOTES.md.
//                      Optional; a missing file just means "no earlier release".

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, STORE_FILE } from '../lib/paths.ts';
import { readSourceUrls } from '../lib/pipeline.ts';
import { loadBuildOrder } from '../lib/registry.ts';
import { exportRelease } from '../lib/release.ts';

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};

if (!existsSync(STORE_FILE)) {
  console.error(`${STORE_FILE} not found: run "npm run build:data" first`);
  process.exit(1);
}

const outDir = join(ROOT, option('out') ?? 'release');
const month = option('month') ?? new Date().toISOString().slice(0, 7);
if (!/^\d{4}-\d{2}$/.test(month)) {
  console.error(`--month must look like 2026-10, got "${month}"`);
  process.exit(1);
}

const order = await loadBuildOrder();
const result = exportRelease({ storeFile: STORE_FILE, outDir, order, sourceUrls: readSourceUrls(), month, previousFields: option('previous-fields') });
console.log(`Wrote ${result.files.join(', ')} to ${outDir}`);
console.log(`  ${result.schools} schools, ${result.fields} documented columns; fields added: ${result.added.length}, removed: ${result.removed.length}`);
