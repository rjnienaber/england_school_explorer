import { downloadFilteredCsv } from '../../lib/filter-csv.ts';
import { openUrl } from '../../lib/download.ts';
import { eesCsvUrl } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

const PUBLICATION = 'f657afb4-8f4a-427d-a683-15f11a2aefb5';
const CATALOGUE_LIST = `https://explore-education-statistics.service.gov.uk/data-catalogue?publicationId=${PUBLICATION}`;
/** "School level data - 2026" when this was written. Only used if the catalogue page cannot be read. */
const KNOWN_ID = 'c5490fd8-6cf3-469e-9f60-0b4262134cb5';

/**
 * The catalogue id of the latest "School level data" file. The catalogue id changes every year (the file is titled
 * "School level data - <year>"), and the public API has no school-level data set for this
 * release, so the id is read from the catalogue listing, which names the files in plain HTML. If the page changes shape
 * the known id is used, which gives last year's figures rather than failing.
 */
async function fetchText(url: string): Promise<string> {
  const { stream } = await openUrl(url);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

async function schoolLevelId(): Promise<string> {
  try {
    const html = await fetchText(CATALOGUE_LIST);
    const found: { id: string; year: number }[] = [];
    for (const m of html.matchAll(/data-set\/([0-9a-f-]{36})"[^>]*>([\s\S]{0,400}?)<\/a>/g)) {
      const title = m[2].replace(/<[^>]*>/g, ' ');
      const year = /School level data\s*-\s*(\d{4})/.exec(title)?.[1];
      if (year) found.push({ id: m[1], year: Number(year) });
    }
    found.sort((a, b) => b.year - a.year);
    if (found[0]) return found[0].id;
  } catch {
    // fall through to the known id
  }
  return KNOWN_ID;
}

export const sources: SourceDef[] = [
  {
    id: 'sen-school',
    describe: 'DfE Special educational needs in England, school level data',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/special-educational-needs-in-england',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (January census, published in June)',
    usedFor: 'Pupils with an EHC plan and pupils on SEN support, whole school, against all pupils on roll',
    notes:
      'The file (363 MB uncompressed, 15 MB over the wire, since the server compresses it) is one long table of every school and has no API version, so it is streamed and filtered as it arrives: ' +
      'only the whole-school rows (all pupils, SEN support, EHC plan) and four columns are stored (about 2 MB). The breakdown by primary need (about 640,000 rows) is not read. ' +
      'The file holds the latest census only, and a new one is published each year under a new id ("School level data - <year>"), found from the catalogue listing. Counts are not suppressed. The school URN is written in scientific notation for one school (`1.00E+05`), which parses to its real URN.',
    // "School level data - <year>" in Special educational needs in England. Each year's release adds a new file with a new
    // id; schoolLevelId() picks the newest from the catalogue listing. To do it by hand, open
    // https://explore-education-statistics.service.gov.uk/data-catalogue?publicationId=f657afb4-8f4a-427d-a683-15f11a2aefb5
    // and copy the id from the link of "School level data - <year>". The other files of this release are in the API but
    // stop at local authority level, so the catalogue file is the only school-level source.
    fetchTo: async (file) => {
      const url = eesCsvUrl(await schoolLevelId());
      await downloadFilteredCsv(url, file, {
        columns: ['time_period', 'school_urn', 'sen_provision', 'pupil_count'],
        keep: (r) => r.geographic_level === 'School' && r.specialist_provision_unit_type === 'All pupils' && r.sen_primary_need === 'All pupils',
        latestPeriod: 'any',
      });
      return url;
    },
  },
];
