import type { SourceDef } from '../../lib/dimension.ts';
import { downloadFilteredCsv } from '../../lib/filter-csv.ts';
import { HttpError } from '../../lib/download.ts';

/**
 * The GIAS columns the modules read (gias-core, boarding, deprivation, opening-date, religion, school-capacity,
 * sen-provision and urban-rural). A module that reads another column adds it here. Missing ones make the download fail.
 */
const COLUMNS = [
  'URN', 'EstablishmentName', 'EstablishmentStatus (name)', 'LA (name)', 'Town', 'Postcode', 'SchoolWebsite',
  'TypeOfEstablishment (name)', 'EstablishmentTypeGroup (name)', 'Gender (name)', 'StatutoryLowAge', 'StatutoryHighAge',
  'OfficialSixthForm (name)', 'AdmissionsPolicy (name)', 'ReligiousCharacter (name)', 'ReligiousEthos (name)', 'Diocese (name)',
  'Trusts (name)', 'NumberOfPupils', 'SchoolCapacity', 'Easting', 'Northing', 'LSOA (code)', 'UrbanRural (name)',
  'OpenDate', 'ReasonEstablishmentOpened (name)', 'Boarders (name)', 'TypeOfResourcedProvision (name)',
  ...Array.from({ length: 13 }, (_, i) => `SEN${i + 1} (name)`), 'ResourcedProvisionCapacity', 'SenUnitCapacity',
];

const url = (yyyymmdd: string) => `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${yyyymmdd}.csv`;

export const sources: SourceDef[] = [
  {
    id: 'gias',
    describe: 'Get Information About Schools: daily extract of every establishment',
    homepage: 'https://get-information-schools.service.gov.uk/',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'daily',
    usedFor: 'Location, type, pupils on roll, capacity, status, age range, gender, sixth form, admissions policy, religion, religious ethos and diocese, trust, website, SEN units and resourced provision, urban or rural area, boarding schools, opening date and reason',
    notes: 'Windows-1252. Only open establishments and the columns the modules read are kept (the extract is about 65 MB; about 10 MB is stored). Gives British National Grid easting/northing, which are converted to WGS84 with `proj4`.',
    encoding: 'windows-1252',
    // A dated extract (edubasealldataYYYYMMDD.csv) is published every day; today's may not exist yet early in the morning.
    // Streamed and filtered: only open establishments and the columns read are stored (the extract is 65 MB; this is
    // a few MB). Closed schools are never used (gias-core skips them).
    fetchTo: async (file) => {
      const candidates = Array.from({ length: 7 }, (_, daysAgo) => url(new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '')));
      for (const candidate of candidates) {
        try {
          await downloadFilteredCsv(candidate, file, {
            columns: COLUMNS,
            keep: (r) => (r['EstablishmentStatus (name)'] ?? '').startsWith('Open'),
            encoding: 'windows-1252',
          });
          return candidate;
        } catch (e) {
          if (!(e instanceof HttpError)) throw e;
        }
      }
      throw new Error(`gias: failed to download any of ${candidates.length} candidate URLs, e.g. ${candidates[0]}`);
    },
  },
];
