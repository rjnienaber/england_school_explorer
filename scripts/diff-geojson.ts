// Compares two builds' school data and reports every difference: schools added or removed,
// location changes, fields added, removed or changed, and metadata changes. Property order
// and metadata.builtAt are ignored. Exits 1 if anything differs.
//
// Each side is either a schools.geojson file (what builds before #31 wrote) or a data folder
// (dist/data: core.json, modes/, details/). A folder is rebuilt into one record per school
// with the same decoding the browser uses, so this also proves the split files are complete.
//
// Usage: node scripts/diff-geojson.ts <old> <new> [--allow-new-properties]
//
// Used to prove a change altered nothing: build first, keep a copy of dist/data, then
//   cp -r dist/data /tmp/old-data
//   node scripts/diff-geojson.ts /tmp/old-data dist/data --allow-new-properties
// --allow-new-properties lets a PR that adds a dimension pass while still proving every
// existing property (and the school list) is unchanged.
// (To check dist/data against the build store instead, run scripts/verify-data.ts.)

import { readFileSync, statSync } from 'node:fs';
import { readDataFolder, toGeojson } from '../lib/read-data.ts';

interface Feature {
  geometry: unknown;
  properties: Record<string, unknown>;
}
interface Collection {
  metadata: Record<string, unknown>;
  features: Feature[];
}

const args = process.argv.slice(2);
const allowNew = args.includes('--allow-new-properties');
const [oldFile, newFile] = args.filter((a) => !a.startsWith('--'));
if (!oldFile || !newFile) {
  console.error('Usage: node scripts/diff-geojson.ts <old.geojson|data folder> <new.geojson|data folder> [--allow-new-properties]');
  process.exit(2);
}

function load(path: string): Collection {
  if (!statSync(path).isDirectory()) return JSON.parse(readFileSync(path, 'utf-8')) as Collection;
  const folder = readDataFolder(path);
  if (folder.problems.length) {
    console.error(`${path} is inconsistent:\n  ${folder.problems.slice(0, 10).join('\n  ')}`);
    process.exit(1);
  }
  return toGeojson(folder) as unknown as Collection;
}
const a = load(oldFile);
const b = load(newFile);

/** JSON with sorted keys, so equal values compare equal whatever their key order. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)))
      : val,
  );

const problems: string[] = [];
const report = (message: string) => {
  if (problems.length < 40) problems.push(message);
  count++;
};
let count = 0;

const byUrn = (c: Collection) => new Map(c.features.map((f) => [f.properties.urn as number, f]));
const oldBy = byUrn(a);
const newBy = byUrn(b);
if (oldBy.size !== a.features.length || newBy.size !== b.features.length) report('duplicate URNs in one of the files');

for (const urn of oldBy.keys()) if (!newBy.has(urn)) report(`urn ${urn}: missing from new output`);
for (const urn of newBy.keys()) if (!oldBy.has(urn)) report(`urn ${urn}: only in new output`);

const added = new Set<string>();
let compared = 0;
let valueCells = 0;
for (const [urn, fa] of oldBy) {
  const fb = newBy.get(urn);
  if (!fb) continue;
  compared++;
  if (canon(fa.geometry) !== canon(fb.geometry)) report(`urn ${urn}: geometry ${canon(fa.geometry)} → ${canon(fb.geometry)}`);
  for (const key of new Set([...Object.keys(fa.properties), ...Object.keys(fb.properties)])) {
    const inOld = key in fa.properties;
    const inNew = key in fb.properties;
    if (inOld && !inNew) report(`urn ${urn}: property ${key} removed`);
    else if (!inOld && inNew) {
      if (allowNew) added.add(key);
      else report(`urn ${urn}: property ${key} added`);
    } else {
      valueCells++;
      if (canon(fa.properties[key]) !== canon(fb.properties[key])) {
        report(`urn ${urn}: ${key} ${canon(fa.properties[key])} → ${canon(fb.properties[key])}`);
      }
    }
  }
}

const metaKeys = new Set([...Object.keys(a.metadata), ...Object.keys(b.metadata)]);
metaKeys.delete('builtAt');
for (const key of metaKeys) {
  if (canon(a.metadata[key]) !== canon(b.metadata[key])) report(`metadata.${key}: ${canon(a.metadata[key])} → ${canon(b.metadata[key])}`);
}

console.log(`Compared ${compared} schools (${valueCells.toLocaleString()} property values) in ${oldBy.size} old / ${newBy.size} new features.`);
if (added.size) console.log(`New properties (allowed): ${[...added].join(', ')}`);
if (count === 0) {
  console.log('Differences: 0');
} else {
  console.log(`Differences: ${count}${count > problems.length ? ` (first ${problems.length} shown)` : ''}`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
