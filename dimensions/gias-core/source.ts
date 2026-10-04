import type { SourceDef } from '../../lib/dimension.ts';

const url = (yyyymmdd: string) => `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${yyyymmdd}.csv`;

export const sources: SourceDef[] = [
  {
    id: 'gias',
    describe: 'Get Information About Schools: daily extract of every establishment',
    homepage: 'https://get-information-schools.service.gov.uk/',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'daily',
    usedFor: 'Location, type, pupils on roll, capacity, status, age range, gender, sixth form, admissions policy, religion, trust, website',
    notes: 'Windows-1252. Gives British National Grid easting/northing, which are converted to WGS84 with `proj4`.',
    encoding: 'windows-1252',
    // A dated extract (edubasealldataYYYYMMDD.csv) is published every day; today's may not exist yet early in the morning.
    resolve: async () =>
      Array.from({ length: 7 }, (_, daysAgo) => url(new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10).replaceAll('-', ''))),
  },
];
