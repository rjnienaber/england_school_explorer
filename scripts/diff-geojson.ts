// Compares two schools.geojson files and reports every difference: features added or
// removed, geometry changes, properties added, removed or changed, and metadata changes.
// Property order and metadata.builtAt are ignored. Exits 1 if anything differs.
//
// Usage: node scripts/diff-geojson.ts <old.geojson> <new.geojson> [--allow-new-properties]
//
// Used to prove a refactor changed nothing: build the old output first, keep a copy, then
//   node scripts/diff-geojson.ts /path/to/old/schools.geojson dist/schools.geojson
// --allow-new-properties lets a PR that adds a dimension pass while still proving every
// existing property (and the feature list) is unchanged.

import { readFileSync } from 'node:fs';

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
  console.error('Usage: node scripts/diff-geojson.ts <old.geojson> <new.geojson> [--allow-new-properties]');
  process.exit(2);
}

const load = (file: string) => JSON.parse(readFileSync(file, 'utf-8')) as Collection;
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
