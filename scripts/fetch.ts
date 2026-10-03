// Downloads the three source datasets into data/. All are Open Government Licence v3.
//
//   ks4.csv     DfE KS4 institution-level performance (Explore Education Statistics)
//   gias.csv    Get Information About Schools: register of all schools, with coordinates
//   ofsted.csv  Ofsted monthly management information: latest inspection per school
//
// Usage: node scripts/fetch.ts [--force]

import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { DATA_DIR, SOURCES_FILE, dataPath } from './paths.ts';

// "Key stage 4 institution level - Schools (performance)", 2022/23 onwards.
// This data-set id stays the same as new academic years are added.
const KS4_URL =
  'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/5b3d308c-da72-467f-b2ef-ab77d576a455/csv';

const GIAS_URL = (yyyymmdd: string) =>
  `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${yyyymmdd}.csv`;

const OFSTED_PAGE_API =
  'https://www.gov.uk/api/content/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes';

const force = process.argv.includes('--force');

async function download(url: string, file: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok || !res.body) return false;
  const tmp = `${file}.part`;
  await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), createWriteStream(tmp));
  await rename(tmp, file);
  const { size } = await stat(file);
  console.log(`  ${(size / 1e6).toFixed(1)} MB → ${file}`);
  return true;
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

// GIAS publishes a dated extract every day; today's may not exist yet early in the morning.
async function fetchGias(file: string): Promise<string> {
  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const d = new Date(Date.now() - daysAgo * 86_400_000);
    const url = GIAS_URL(yyyymmdd(d));
    if (await download(url, file)) return url;
  }
  throw new Error('No GIAS extract found for the last 7 days');
}

interface Attachment {
  title?: string;
  url?: string;
}

// The Ofsted page lists one CSV per month, titled "... latest inspections as at 31 August 2026".
async function latestOfstedUrl(): Promise<{ title: string; url: string }> {
  const res = await fetch(OFSTED_PAGE_API);
  if (!res.ok) throw new Error(`GOV.UK content API returned ${res.status}`);
  const page = (await res.json()) as { details: { attachments: Attachment[] } };

  const candidates = page.details.attachments
    .filter((a) => a.url?.endsWith('.csv') && /state-funded schools - latest inspections as at/i.test(a.title ?? ''))
    .map((a) => {
      const date = new Date(a.title!.replace(/.*as at\s+/i, ''));
      return { title: a.title!, url: a.url!, date };
    })
    .filter((a) => !Number.isNaN(a.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (candidates.length === 0) throw new Error('No Ofsted "latest inspections" CSV found');
  return candidates[0];
}

async function step(name: string, file: string, run: () => Promise<string>): Promise<string | undefined> {
  if (existsSync(file) && !force) {
    console.log(`${name}: already downloaded (use --force to refresh)`);
    return undefined;
  }
  console.log(`${name}: downloading`);
  return run();
}

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const sources: Record<string, string> = {};
  const record = (key: string, value: string | undefined) => {
    if (value) sources[key] = value;
  };

  record('ks4', await step('KS4 performance', dataPath('ks4.csv'), async () => {
    if (!(await download(KS4_URL, dataPath('ks4.csv')))) throw new Error(`Failed to download ${KS4_URL}`);
    return KS4_URL;
  }));

  record('gias', await step('GIAS register', dataPath('gias.csv'), () => fetchGias(dataPath('gias.csv'))));

  record('ofsted', await step('Ofsted inspections', dataPath('ofsted.csv'), async () => {
    const { title, url } = await latestOfstedUrl();
    console.log(`  ${title}`);
    if (!(await download(url, dataPath('ofsted.csv')))) throw new Error(`Failed to download ${url}`);
    return url;
  }));

  if (Object.keys(sources).length > 0) {
    let existing: Record<string, string> = {};
    try {
      existing = JSON.parse(await readFile(SOURCES_FILE, 'utf-8'));
    } catch {
      // first run
    }
    const merged = { ...existing, ...sources, fetchedAt: new Date().toISOString() };
    await writeFile(SOURCES_FILE, JSON.stringify(merged, null, 2) + '\n');
  }
}

await main();
