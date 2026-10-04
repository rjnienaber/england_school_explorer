// Checks the size of what a visitor downloads against budgets.json, and prints a table.
// Fails (exit 1) with a message naming each file over its budget.
//
// Usage: node scripts/check-budgets.ts [--dist dist] [--budgets budgets.json] [--previous <manifest path or URL>]
//   --previous   an earlier dist/data/manifest.json (the deployed site's, say) to show the change against.
//                Optional; a missing or unreadable one is ignored.
//
// Reads dist/data/manifest.json and dist/data/<phase>/manifest.json (written by `npm run build:data`) and the bundle files in dist/.
// In GitHub Actions the table is also appended to $GITHUB_STEP_SUMMARY.

import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { DIST_DIR, ROOT } from '../lib/paths.ts';

export interface Budgets {
  core: { maxGzipKB: number };
  mode: { maxGzipKB: number };
  detail: { maxGzipKB: number };
  bundle: { files: string[]; baselineGzipKB: number; maxGrowthPercent: number };
  /** Per-phase overrides of core, mode and detail (the primary dataset is four times the size of the secondary one). */
  phases?: Record<string, { core?: { maxGzipKB: number; why?: string }; mode?: { maxGzipKB: number; why?: string }; detail?: { maxGzipKB: number; why?: string } }>;
}

export interface SizedFile {
  path: string;
  raw: number;
  gzip: number;
}

export interface Row extends SizedFile {
  /** Budget in bytes, or null when the row has none of its own. */
  budget: number | null;
  /** Change in gzipped bytes against the previous release, or null when unknown. */
  delta: number | null;
  over: boolean;
  note?: string;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const signed = (bytes: number | null) => (bytes === null ? 'n/a' : Math.abs(bytes) < 52 ? '0.0 KB' : `${bytes > 0 ? '+' : '-'}${kb(Math.abs(bytes))}`);

/** Pure: turns the manifest and bundle sizes into table rows. Data files are grouped: every mode column, and the largest popup shard. */
export function evaluate(
  manifest: { files: SizedFile[] },
  bundle: SizedFile[],
  budgets: Budgets,
  previous?: { files: SizedFile[] } | null,
  /** Prefix for the paths shown (for example 'primary/'), when the manifest is a phase's rather than the secondary one. */
  prefix = '',
): { rows: Row[]; problems: string[] } {
  const before = new Map(previous?.files.map((f) => [f.path, f.gzip]));
  const delta = (path: string, gzip: number) => (before.has(path) ? gzip - before.get(path)! : null);
  const rows: Row[] = [];
  const problems: string[] = [];
  const fix = 'Raise it in budgets.json only if the growth is intended, or move fields to a later-loaded placement (docs/adding-a-dimension.md).';

  const check = (file: SizedFile, label: string, limitKB: number, key: string, note?: string): Row => {
    const budget = limitKB * 1024;
    const over = file.gzip > budget;
    if (over) problems.push(`${prefix}${file.path} is ${kb(file.gzip)} gzipped, over the ${key} budget of ${limitKB} KB (by ${kb(file.gzip - budget)}). ${fix}`);
    return { ...file, path: prefix + label, budget, delta: delta(file.path, file.gzip), over, note };
  };

  const core = manifest.files.find((f) => f.path === 'core.json');
  if (!core) problems.push(`${prefix}core.json is not in the manifest: did build:data run?`);
  else rows.push(check(core, 'core.json', budgets.core.maxGzipKB, 'core'));

  for (const f of manifest.files.filter((f) => f.path.startsWith('modes/')).sort((a, b) => a.path.localeCompare(b.path))) {
    rows.push(check(f, f.path, budgets.mode.maxGzipKB, 'mode'));
  }

  const shards = manifest.files.filter((f) => f.path.startsWith('details/'));
  for (const s of shards) {
    if (s.gzip > budgets.detail.maxGzipKB * 1024 && s !== shards.reduce((a, b) => (b.gzip > a.gzip ? b : a))) {
      problems.push(`${prefix}${s.path} is ${kb(s.gzip)} gzipped, over the detail budget of ${budgets.detail.maxGzipKB} KB. ${fix}`);
    }
  }
  if (shards.length) {
    const largest = shards.reduce((a, b) => (b.gzip > a.gzip ? b : a));
    rows.push(check(largest, `${largest.path} (largest of ${shards.length})`, budgets.detail.maxGzipKB, 'detail'));
  }

  if (prefix) return { rows, problems }; // a phase's manifest has no bundle of its own

  for (const f of bundle) rows.push({ ...f, budget: null, delta: null, over: false });
  const total = bundle.reduce((s, f) => s + f.gzip, 0);
  const limit = budgets.bundle.baselineGzipKB * 1024 * (1 + budgets.bundle.maxGrowthPercent / 100);
  const growth = (total / (budgets.bundle.baselineGzipKB * 1024) - 1) * 100;
  const over = total > limit;
  if (over) {
    problems.push(
      `The JavaScript bundle (${budgets.bundle.files.join(' + ')}) is ${kb(total)} gzipped, ${growth.toFixed(1)}% over the ${budgets.bundle.baselineGzipKB} KB baseline ` +
        `(allowed: ${budgets.bundle.maxGrowthPercent}%). If this is intended, update baselineGzipKB in budgets.json.`,
    );
  }
  rows.push({
    path: 'JS bundle total',
    raw: bundle.reduce((s, f) => s + f.raw, 0),
    gzip: total,
    budget: limit,
    delta: total - budgets.bundle.baselineGzipKB * 1024,
    over,
    note: `${growth > 0.05 ? '+' : ''}${growth.toFixed(1).replace('-0.0', '0.0')}% vs baseline`,
  });
  return { rows, problems };
}

/** A plain-text table for the log. */
export function textTable(rows: Row[]): string {
  const cells = [['File', 'Raw', 'Gzip', 'Budget', 'Change', ''], ...rows.map((r) => [r.path, kb(r.raw), kb(r.gzip), r.budget === null ? '-' : kb(r.budget), signed(r.delta), r.over ? 'OVER BUDGET' : (r.note ?? '')])];
  const widths = cells[0].map((_, i) => Math.max(...cells.map((c) => c[i].length)));
  return cells.map((c) => c.map((v, i) => (i === 0 || i === 5 ? v.padEnd(widths[i]) : v.padStart(widths[i]))).join('  ').trimEnd()).join('\n');
}

/** A Markdown table for the Actions step summary. */
export function markdownTable(rows: Row[], problems: string[]): string {
  const lines = [
    '## Data size budgets',
    '',
    problems.length ? `**${problems.length} over budget**` : 'All within budget.',
    '',
    '| File | Raw | Gzip | Budget | Change vs previous | |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    ...rows.map((r) => `| ${r.path} | ${kb(r.raw)} | ${kb(r.gzip)} | ${r.budget === null ? '-' : kb(r.budget)} | ${signed(r.delta)} | ${r.over ? '**over budget**' : (r.note ?? '')} |`),
  ];
  for (const p of problems) lines.push('', `- ${p}`);
  return lines.join('\n') + '\n';
}

async function loadJson<T>(source: string): Promise<T | null> {
  try {
    if (/^https?:\/\//.test(source)) {
      const res = await fetch(source);
      return res.ok ? ((await res.json()) as T) : null;
    }
    return JSON.parse(await readFile(source, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string | undefined) => args[args.indexOf(name) + 1] ?? fallback;
  const dist = args.includes('--dist') ? option('--dist', DIST_DIR)! : DIST_DIR;
  const budgetsFile = args.includes('--budgets') ? option('--budgets', '')! : join(ROOT, 'budgets.json');
  const previousSource = args.includes('--previous') ? option('--previous', undefined) : undefined;

  const budgets = await loadJson<Budgets>(budgetsFile);
  if (!budgets) throw new Error(`Cannot read ${budgetsFile}`);
  const manifest = await loadJson<{ files: SizedFile[] }>(join(dist, 'data', 'manifest.json'));
  if (!manifest) throw new Error(`Cannot read ${join(dist, 'data', 'manifest.json')}: run "npm run build:data" first`);
  const previous = previousSource ? await loadJson<{ files: SizedFile[] }>(previousSource) : null;
  if (previousSource && !previous) console.log(`(no previous manifest at ${previousSource}: skipping the change column)`);

  const bundle: SizedFile[] = [];
  for (const name of budgets.bundle.files) {
    const bytes = await readFile(join(dist, name)).catch(() => {
      throw new Error(`${join(dist, name)} is missing: run "npm run build:web" first`);
    });
    bundle.push({ path: name, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length });
  }

  const { rows, problems } = evaluate(manifest, bundle, budgets, previous);
  // Other phases: their own manifest under dist/data/<phase>/, with the top-level budgets overridden by budgets.phases.<phase>.
  for (const [phase, override] of Object.entries(budgets.phases ?? {})) {
    const phaseManifest = await loadJson<{ files: SizedFile[] }>(join(dist, 'data', phase, 'manifest.json'));
    if (!phaseManifest) {
      problems.push(`${join(dist, 'data', phase, 'manifest.json')} is missing: run "npm run build:data" first`);
      continue;
    }
    const phasePrevious = previousSource ? await loadJson<{ files: SizedFile[] }>(previousSource.replace(/manifest\.json$/, `${phase}/manifest.json`)) : null;
    const result = evaluate(phaseManifest, [], { ...budgets, ...override }, phasePrevious, `${phase}/`);
    rows.push(...result.rows);
    problems.push(...result.problems);
  }
  console.log(textTable(rows));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownTable(rows, problems));
  if (problems.length) {
    console.error(`\n${problems.length} size budget(s) exceeded:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('\nAll sizes are within budget.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
