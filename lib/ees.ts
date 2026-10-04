// Helpers for Explore Education Statistics (EES), where most DfE data sets live.
import { rename, writeFile } from 'node:fs/promises';

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

export interface EesQuery {
  /** The API data-set id (not the catalogue file id). Stays the same as releases are added; the query uses the latest version. */
  dataSetId: string;
  /** Filter column name -> option labels to keep, e.g. { sex: ['Total'] }. Filter columns not listed are not restricted. */
  filters: Record<string, string[]>;
  /** Indicator column names to return. */
  indicators: string[];
  /** Rows per request. Default 10000. */
  pageSize?: number;
}

const apiJson = async (url: string, body?: unknown): Promise<any> => {
  const res = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`EES API ${res.status} for ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

/**
 * Downloads only the wanted rows of a school-level data set through the EES query API, instead of the whole CSV
 * (the census file is 2.8 GB; the rows used are about 1 MB). Latest time period only. Writes a CSV with columns
 * `time_period` (e.g. 202526), `school_urn`, one column per filter named in `query.filters` and per indicator, holding
 * the labels / values as in the catalogue CSV. Pages through the results. Returns the number of rows written.
 */
export async function downloadEesQuery(query: EesQuery, file: string): Promise<number> {
  const base = `${API}/data-sets/${query.dataSetId}`;
  const meta = (await apiJson(`${base}/meta`)) as ApiMeta;
  const period = meta.timePeriods[meta.timePeriods.length - 1];
  const schools = new Map<string, string>(
    (meta.locations.find((l) => l.level.code === 'SCH')?.options ?? []).map((o) => [o.id, o.urn ?? '']),
  );
  const filterCols = meta.filters.filter((f) => f.column in query.filters);
  const missing = Object.keys(query.filters).filter((c) => !filterCols.some((f) => f.column === c));
  if (missing.length) throw new Error(`EES data set ${query.dataSetId} has no filter column ${missing.join(', ')}`);
  const indicators = query.indicators.map((c) => {
    const i = meta.indicators.find((x) => x.column === c);
    if (!i) throw new Error(`EES data set ${query.dataSetId} has no indicator ${c}`);
    return i;
  });
  const optionLabel = new Map<string, string>();
  const clauses = filterCols.map((f) => {
    const wanted = query.filters[f.column];
    const ids = wanted.map((label) => {
      const o = f.options.find((x) => x.label === label);
      if (!o) throw new Error(`EES filter ${f.column} has no option "${label}"`);
      return o.id;
    });
    for (const o of f.options) optionLabel.set(o.id, o.label);
    return { filters: { in: ids } };
  });
  const criteria = { and: [{ timePeriods: { in: [{ period: period.period, code: period.code }] } }, { geographicLevels: { in: ['SCH'] } }, ...clauses] };

  const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const header = ['time_period', 'school_urn', ...filterCols.map((f) => f.column), ...indicators.map((i) => i.column)];
  const lines = [header.map(quote).join(',')];
  const pageSize = query.pageSize ?? 10000;
  for (let page = 1; ; page++) {
    const res = await apiJson(`${base}/query`, { criteria, indicators: indicators.map((i) => i.id), page, pageSize });
    for (const r of res.results as { locations: Record<string, string>; filters: Record<string, string>; values: Record<string, string> }[]) {
      lines.push(
        [
          period.period.slice(0, 4) + period.period.slice(-2),
          schools.get(r.locations.SCH) ?? '',
          ...filterCols.map((f) => optionLabel.get(r.filters[f.id]) ?? ''),
          ...indicators.map((i) => r.values[i.id] ?? ''),
        ]
          .map(quote)
          .join(','),
      );
    }
    if (page >= res.paging.totalPages) break;
  }
  await writeFile(`${file}.part`, lines.join('\n') + '\n');
  await rename(`${file}.part`, file);
  return lines.length - 1;
}
