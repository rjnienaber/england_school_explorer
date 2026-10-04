// Helpers for Explore Education Statistics (EES), where most DfE data sets live.
import { rename, writeFile } from 'node:fs/promises';
import { csvCell } from './csv.ts';
import { fetchJson } from './download.ts';
import { downloadFilteredCsv } from './filter-csv.ts';

const CATALOGUE = 'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set';
const API = 'https://api.education.gov.uk/statistics/v1';

/**
 * CSV download URL for a data-set id (the UUID in the data catalogue page URL, e.g.
 * .../data-catalogue/data-set/<id>). For most series the id stays the same as new years
 * are added to the data set; if a series gets a new id each release, use
 * `latestDataSetId` instead.
 */
export function eesCsvUrl(dataSetId: string): string {
  return `${CATALOGUE}/${dataSetId}/csv`;
}

interface ApiDataSet {
  id: string;
  title: string;
  status?: string;
  latestVersion?: { published?: string; file?: { id?: string } };
}

/**
 * Finds the catalogue id (what `eesCsvUrl` wants) of the latest published data set in an
 * EES publication, through the public API
 * (https://api.education.gov.uk/statistics/v1/publications/<pubId>/data-sets).
 * `match` picks one when the publication has several, e.g. by title. Note the API's own
 * data-set `id` is not the catalogue id: the catalogue uses the latest version's file id.
 * Find a publication id with `curl https://api.education.gov.uk/statistics/v1/publications`.
 */
export async function latestDataSetId(publicationId: string, match: (title: string) => boolean = () => true): Promise<string> {
  const res = await fetch(`${API}/publications/${publicationId}/data-sets?pageSize=20`);
  if (!res.ok) throw new Error(`EES API returned ${res.status} for publication ${publicationId}`);
  const body = (await res.json()) as { results?: ApiDataSet[] };
  const candidates = (body.results ?? [])
    .filter((d) => (d.status ?? 'Published') === 'Published' && d.latestVersion?.file?.id && match(d.title))
    .sort((a, b) => (b.latestVersion?.published ?? '').localeCompare(a.latestVersion?.published ?? ''));
  if (candidates.length === 0) throw new Error(`No matching data set in EES publication ${publicationId}`);
  return candidates[0].latestVersion!.file!.id!;
}

/** Convenience: the CSV URL of the latest matching data set in a publication. */
export async function latestEesCsvUrl(publicationId: string, match?: (title: string) => boolean): Promise<string> {
  return eesCsvUrl(await latestDataSetId(publicationId, match));
}

/** "202425" → "2024/25" (EES `time_period` values for academic years). */
export const academicYear = (timePeriod: string) => `${timePeriod.slice(0, 4)}/${timePeriod.slice(4)}`;

// ---------- Filtered download through the EES public API ----------

interface ApiMeta {
  filters: { id: string; column: string; options: { id: string; label: string }[] }[];
  indicators: { id: string; column: string }[];
  timePeriods: { code: string; period: string }[];
  locations: { level: { code: string }; options: { id: string; urn?: string }[] }[];
}

/** One set of rows to fetch from a data set. */
export interface EesRowSet {
  /**
   * Filter column name -> option labels to keep, e.g. { sex: ['Total'] }. `true` keeps every option but still writes the column.
   * Filter columns not listed are not restricted (the column is still written if another row set lists it).
   */
  filters: Record<string, string[] | true>;
  /** Indicator column names to return. */
  indicators: string[];
}

export interface EesQuery extends EesRowSet {
  /** The API data-set id (not the catalogue file id). Stays the same as releases are added; the query uses the latest version. */
  dataSetId: string;
  /**
   * More row sets, fetched with their own filters and indicators into the same file. The file has the columns of all the
   * sets together; a row has an empty value for an indicator its set did not ask for. For a file where some rows need
   * every column and many rows need a few (the KS4 file: school totals against pupil groups), this is much smaller than
   * asking for every column of every row. The sets must not overlap, or rows repeat.
   */
  also?: EesRowSet[];
  /** Filter columns used to pick rows (or for `derive`) that are not worth a column in the file. */
  hide?: string[];
  /** How many of the newest time periods to fetch, or 'all'. Default 1 (the latest). */
  periods?: number | 'all';
  /**
   * Extra columns worked out from each row, named by key. `values` holds the row's filter labels and indicator values
   * by column name. Used where the catalogue CSV has a column the API doesn't: the KS4 file's `breakdown` is the one
   * filter that is not "Total" in that row.
   */
  derive?: Record<string, (values: Record<string, string>) => string>;
  /** Rows per request. Default 10000. */
  pageSize?: number;
}

/**
 * Downloads only the wanted rows of a school-level data set through the EES query API, instead of the whole CSV
 * (the census file is 2.8 GB; the rows used are about 1 MB). The latest time period only, unless `periods` says
 * otherwise. Writes a CSV with columns `time_period` (e.g. 202526), `school_urn`, one column per filter named in
 * `query.filters` and per indicator, then the `derive`d ones, holding the labels / values as in the catalogue CSV.
 * Pages through the results. Returns the number of rows written.
 */
export async function downloadEesQuery(query: EesQuery, file: string): Promise<number> {
  const base = `${API}/data-sets/${query.dataSetId}`;
  const meta = (await fetchJson(`${base}/meta`)) as ApiMeta;
  const wantedPeriods = query.periods === 'all' ? meta.timePeriods : meta.timePeriods.slice(-(query.periods ?? 1));
  const schools = new Map<string, string>(
    (meta.locations.find((l) => l.level.code === 'SCH')?.options ?? []).map((o) => [o.id, o.urn ?? '']),
  );
  const sets = [query, ...(query.also ?? [])];
  const filterNames = [...new Set(sets.flatMap((set) => Object.keys(set.filters)))];
  const filterCols = meta.filters.filter((f) => filterNames.includes(f.column));
  const missing = filterNames.filter((c) => !filterCols.some((f) => f.column === c));
  if (missing.length) throw new Error(`EES data set ${query.dataSetId} has no filter column ${missing.join(', ')}`);
  const indicators = [...new Set(sets.flatMap((set) => set.indicators))].map((c) => {
    const i = meta.indicators.find((x) => x.column === c);
    if (!i) throw new Error(`EES data set ${query.dataSetId} has no indicator ${c}`);
    return i;
  });
  const optionLabel = new Map<string, string>();
  for (const f of filterCols) for (const o of f.options) optionLabel.set(o.id, o.label);

  const derived = Object.entries(query.derive ?? {});
  const shown = filterCols.filter((f) => !query.hide?.includes(f.column));
  const header = ['time_period', 'school_urn', ...shown.map((f) => f.column), ...indicators.map((i) => i.column), ...derived.map(([name]) => name)];
  const lines = [header.map(csvCell).join(',')];
  // "2024/2025" → "202425"
  const periodCode = (period: string) => period.slice(0, 4) + period.slice(-2);
  const pageSize = query.pageSize ?? 10000;

  for (const set of sets) {
    const clauses = filterCols.flatMap((f) => {
      const wanted = set.filters[f.column];
      if (wanted === undefined || wanted === true) return [];
      const ids = wanted.map((label) => {
        const o = f.options.find((x) => x.label === label);
        if (!o) throw new Error(`EES filter ${f.column} has no option "${label}"`);
        return o.id;
      });
      return [{ filters: { in: ids } }];
    });
    const criteria = {
      and: [{ timePeriods: { in: wantedPeriods.map((p) => ({ period: p.period, code: p.code })) } }, { geographicLevels: { in: ['SCH'] } }, ...clauses],
    };
    const asked = set.indicators.map((c) => indicators.find((i) => i.column === c)!);
    for (let page = 1; ; page++) {
      const res = await fetchJson(`${base}/query`, { criteria, indicators: asked.map((i) => i.id), page, pageSize });
      for (const r of res.results as { timePeriod: { period: string }; locations: Record<string, string>; filters: Record<string, string>; values: Record<string, string> }[]) {
        const filterCells: Record<string, string> = {};
        for (const f of filterCols) filterCells[f.column] = optionLabel.get(r.filters[f.id]) ?? '';
        const cells: Record<string, string> = { ...filterCells };
        for (const i of indicators) cells[i.column] = r.values[i.id] ?? '';
        lines.push(
          [
            periodCode(r.timePeriod.period),
            schools.get(r.locations.SCH) ?? '',
            ...shown.map((f) => cells[f.column]),
            ...indicators.map((i) => cells[i.column]),
            ...derived.map(([, fn]) => fn(cells)),
          ]
            .map(csvCell)
            .join(','),
        );
      }
      if (page >= res.paging.totalPages) break;
    }
  }
  await writeFile(`${file}.part`, lines.join('\n') + '\n');
  await rename(`${file}.part`, file);
  return lines.length - 1;
}

// ---------- Latest year only, from a catalogue CSV ----------

/**
 * For a data set that is not in the EES query API (the school workforce files are not): streams the catalogue CSV
 * and keeps only the newest time period and the wanted columns, so the file on disk is a few MB instead of
 * hundreds. These files list the newest year first, so the download is stopped as soon as an older period appears,
 * which also saves most of the transfer. If the file is ever not newest-first (a newer period turns up after an older
 * one), this throws rather than quietly keeping the wrong year. Returns the number of rows written.
 * For other row filters, or files in another order, use `downloadFilteredCsv` (lib/filter-csv.ts) directly.
 */
export function downloadLatestPeriodCsv(url: string, file: string, columns: string[]): Promise<number> {
  return downloadFilteredCsv(url, file, { columns: ['time_period', ...columns], latestPeriod: 'newest-first' });
}
