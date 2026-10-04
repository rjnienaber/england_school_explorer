// Downloads every dimension module's sources into data/ and records the resolved URLs in
// data/sources.json. Files already downloaded are skipped.
//
// Each download is reported with the bytes received over the network and the size of the file kept. With
// $GITHUB_STEP_SUMMARY set (GitHub Actions), the same table goes into the run summary.
//
// Usage: node scripts/fetch.ts [--force] [source-id ...]
//   --force      download again even if the file is there
//   source-id    only these sources (see `ls dimensions/*/source.ts`)

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { bytesDownloaded, download } from '../lib/download.ts';
import { DATA_DIR, SOURCES_FILE, dataPath } from '../lib/paths.ts';
import { loadDimensions, validateDimensions } from '../lib/registry.ts';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

async function main(): Promise<void> {
  const dimensions = await loadDimensions();
  validateDimensions(dimensions);
  const all = dimensions.flatMap((d) => d.sources);
  const unknown = only.filter((id) => !all.some((s) => s.id === id));
  if (unknown.length) throw new Error(`Unknown source id(s): ${unknown.join(', ')}. Known: ${all.map((s) => s.id).join(', ')}`);
  const wanted = all.filter((s) => only.length === 0 || only.includes(s.id));

  await mkdir(DATA_DIR, { recursive: true });
  const resolved: Record<string, string> = {};
  const report: { id: string; wire?: number; stored: number }[] = [];

  for (const source of wanted) {
    const file = dataPath(source.file ?? `${source.id}.csv`);
    if (existsSync(file) && !force) {
      console.log(`${source.id}: already downloaded (use --force to refresh)`);
      report.push({ id: source.id, stored: (await stat(file)).size });
      continue;
    }
    console.log(`${source.id}: downloading (${source.describe})`);
    const before = bytesDownloaded();
    const done = async (url: string) => {
      resolved[source.id] = url;
      const stored = (await stat(file)).size;
      const wire = bytesDownloaded() - before;
      console.log(`  ${mb(wire)} downloaded, ${mb(stored)} kept`);
      report.push({ id: source.id, wire, stored });
    };
    if (source.fetchTo) {
      await done(await source.fetchTo(file));
      continue;
    }
    if (!source.resolve) throw new Error(`${source.id}: needs resolve or fetchTo`);
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
    await done(used);
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

  await summarise(report);
}

/** Per-source sizes, to the log and the Actions run summary: the downloaded total is what a forced run costs. */
async function summarise(report: { id: string; wire?: number; stored: number }[]): Promise<void> {
  const fetched = report.filter((r) => r.wire !== undefined);
  const wire = fetched.reduce((sum, r) => sum + r.wire!, 0);
  const stored = report.reduce((sum, r) => sum + r.stored, 0);
  console.log(`Downloaded ${mb(wire)} from ${fetched.length} source(s); data/ holds ${mb(stored)} for ${report.length} source(s)`);
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;
  const lines = [
    '### Data download',
    '',
    '| Source | Downloaded | Kept in data/ |',
    '| --- | ---: | ---: |',
    ...report.map((r) => `| ${r.id} | ${r.wire === undefined ? 'reused' : mb(r.wire)} | ${mb(r.stored)} |`),
    `| **Total** | **${mb(wire)}** | **${mb(stored)}** |`,
    '',
  ];
  await appendFile(summaryFile, lines.join('\n') + '\n');
}

await main();
