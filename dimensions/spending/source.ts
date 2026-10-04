import { writeFile, rename } from 'node:fs/promises';
import { csvCell } from '../../lib/csv.ts';
import { openUrl } from '../../lib/download.ts';
import type { SourceDef } from '../../lib/dimension.ts';
import { readXlsxSheet, unzip, type XlsxRow } from '../../lib/xlsx.ts';

const SITE = 'https://financial-benchmarking-and-insights-tool.education.gov.uk';

// The site answers 403 to anything that does not look like a browser, so we say we are one. The files are public
// downloads linked from the tool's own "Data sources" page (no sign-in), licensed under the OGL.
const HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; england_school_explorer data fetch; +https://github.com/rjnienaber/england_school_explorer)' };

/** Columns of the file we write, which `parse.ts` reads. One row per return (an academy that changed trust mid-year has two, each with its months): `basis` is `cfr` (maintained) or `aar` (academy). */
export const COLUMNS = ['urn', 'basis', 'year', 'months', 'pupils', 'total_spend', 'teaching_spend'];

async function download(url: string): Promise<Buffer> {
  const { stream } = await openUrl(url, { headers: HEADERS });
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** The newest workbook of a kind linked from the data sources page, e.g. `CFR_2024-25_Full_Data_Workbook.xlsx` -> year "2024-25". */
function newest(page: string, prefix: string): { path: string; year: string } {
  const found = [...page.matchAll(new RegExp(`/files/(${prefix}_(\\d{4}-\\d{2})_[A-Za-z_]+\\.xlsx)`, 'g'))].map((m) => ({ path: `/files/${m[1]}`, year: m[2] }));
  if (found.length === 0) throw new Error(`No ${prefix} workbook linked from ${SITE}/data-sources`);
  return found.sort((a, b) => b.year.localeCompare(a.year))[0];
}

/** Finds a header row (the first row with a cell reading `URN`) and returns the data rows keyed by header text. */
function* table(rows: Generator<XlsxRow>): Generator<Record<string, string>> {
  let headers: Record<string, string> | null = null;
  for (const row of rows) {
    if (!headers) {
      if (Object.values(row).includes('URN')) {
        headers = {};
        for (const [col, label] of Object.entries(row)) if (!(label in headers)) headers[label] = col; // first of any repeated label
      }
      continue;
    }
    const out: Record<string, string> = {};
    for (const [label, col] of Object.entries(headers)) if (row[col] !== undefined) out[label] = row[col];
    yield out;
  }
}

/** The first header that starts with `start` (the CFR and AAR totals have long, formula-like names). */
const pick = (r: Record<string, string>, start: string) => {
  const key = Object.keys(r).find((k) => k.startsWith(start));
  return key ? r[key] : '';
};
// Primary and nursery schools are never on the map, and are most of both files, so they are not kept
const inScope = (r: Record<string, string>) => !['Primary', 'Nursery'].includes(r['Overall Phase'] ?? '');
const numeric = (v: string) => (v !== '' && Number.isFinite(Number(v)) ? v : ''); // `n/s` (not supplied) and the like become empty

/** CFR: one sheet, one row per maintained school. Money is in whole pounds. */
function* cfrRows(zip: Map<string, Buffer>, year: string): Generator<string[]> {
  for (const r of table(readXlsxSheet(zip, 'CFR Data'))) {
    if (!inScope(r)) continue;
    yield [r['URN'], 'cfr', year, numeric(r['Period covered by return'] ?? ''), numeric(r['No pupils'] ?? ''), numeric(pick(r, 'Total Expenditure')), numeric(r['E01 Teaching staff'] ?? '')];
  }
}

/** AAR: the `Academies` sheet has each academy's own spending (trust central services are on a separate sheet we do not use). */
function* aarRows(zip: Map<string, Buffer>, year: string): Generator<string[]> {
  for (const r of table(readXlsxSheet(zip, 'Academies'))) {
    if (!inScope(r)) continue;
    yield [
      r['URN'],
      'aar',
      year,
      numeric(r['Period covered by return'] ?? ''),
      numeric(pick(r, 'Number of pupils in academy')),
      numeric(r['Total Expenditure'] ?? ''),
      numeric(r['Teaching staff'] ?? ''),
    ];
  }
}

export const sources: SourceDef[] = [
  {
    id: 'spending',
    describe: 'DfE Financial Benchmarking and Insights Tool: school income and expenditure (CFR for maintained schools, AAR for academies)',
    homepage: `${SITE}/data-sources`,
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (CFR in the winter after the financial year, AAR in the spring)',
    usedFor: 'Total spending and teaching-staff spending, for spending per pupil and the teaching share of spending',
    notes:
      'Two Excel workbooks (about 8 MB and 7 MB) are downloaded, the newest CFR and the newest AAR, and cut down to the columns we use (a few hundred KB). ' +
      'Academies report as trusts, and the AAR file gives each academy its own spending without the trust central costs that the tool apportions to it, so academy figures are lower than the tool shows. ' +
      'The site refuses requests that do not look like a browser, so the download sends a browser-style user agent.',
    fetchTo: async (file) => {
      const page = (await download(`${SITE}/data-sources`)).toString('utf-8');
      const cfr = newest(page, 'CFR');
      const aar = newest(page, 'AAR');
      const lines = [COLUMNS.join(',')];
      const year = (y: string) => `${y.slice(0, 4)}/${y.slice(5)}`;
      for (const [rows, kind] of [
        [cfrRows(unzip(await download(SITE + cfr.path)), year(cfr.year)), 'CFR'],
        [aarRows(unzip(await download(SITE + aar.path)), year(aar.year)), 'AAR'],
      ] as const) {
        let n = 0;
        for (const r of rows) {
          if (!/^\d+$/.test(r[0] ?? '')) continue;
          lines.push(r.map(csvCell).join(','));
          n++;
        }
        if (n < 1000) throw new Error(`${kind} workbook gave only ${n} schools: has the layout changed?`);
      }
      await writeFile(`${file}.tmp`, lines.join('\n') + '\n');
      await rename(`${file}.tmp`, file);
      return `${SITE}/data-sources`;
    },
  },
];
