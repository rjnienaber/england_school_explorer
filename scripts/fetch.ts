// Downloads every dimension module's sources into data/ and records the resolved URLs in
// data/sources.json. Files already downloaded are skipped.
//
// Usage: node scripts/fetch.ts [--force] [source-id ...]
//   --force      download again even if the file is there
//   source-id    only these sources (see `ls dimensions/*/source.ts`)

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { download } from '../lib/download.ts';
import { DATA_DIR, SOURCES_FILE, dataPath } from '../lib/paths.ts';
import { loadDimensions, validateDimensions } from '../lib/registry.ts';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

async function main(): Promise<void> {
  const dimensions = await loadDimensions();
  validateDimensions(dimensions);
  const all = dimensions.flatMap((d) => d.sources);
  const unknown = only.filter((id) => !all.some((s) => s.id === id));
  if (unknown.length) throw new Error(`Unknown source id(s): ${unknown.join(', ')}. Known: ${all.map((s) => s.id).join(', ')}`);
  const wanted = all.filter((s) => only.length === 0 || only.includes(s.id));

  await mkdir(DATA_DIR, { recursive: true });
  const resolved: Record<string, string> = {};

  for (const source of wanted) {
    const file = dataPath(source.file ?? `${source.id}.csv`);
    if (existsSync(file) && !force) {
      console.log(`${source.id}: already downloaded (use --force to refresh)`);
      continue;
    }
    console.log(`${source.id}: downloading (${source.describe})`);
    const resolvedUrls = await source.resolve();
    const candidates = Array.isArray(resolvedUrls) ? resolvedUrls : [resolvedUrls];
    let used: string | undefined;
    for (const url of candidates) {
      if (await download(url, file)) {
        used = url;
        break;
      }
    }
    if (!used) throw new Error(`${source.id}: failed to download ${candidates.length > 1 ? `any of ${candidates.length} candidate URLs, e.g. ` : ''}${candidates[0]}`);
    resolved[source.id] = used;
  }

  if (Object.keys(resolved).length > 0) {
    let existing: Record<string, string> = {};
    try {
      existing = JSON.parse(await readFile(SOURCES_FILE, 'utf-8'));
    } catch {
      // first run
    }
    await writeFile(SOURCES_FILE, JSON.stringify({ ...existing, ...resolved, fetchedAt: new Date().toISOString() }, null, 2) + '\n');
  }
}

await main();
