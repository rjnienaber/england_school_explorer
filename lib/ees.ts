// Helpers for Explore Education Statistics (EES), where most DfE data sets live.

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
