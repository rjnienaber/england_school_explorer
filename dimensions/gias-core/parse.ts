import proj4 from 'proj4';
import { num, readCsv, text } from '../../lib/csv.ts';

export interface GiasSchool {
  urn: number;
  name: string;
  open: boolean;
  la: string;
  town: string | null;
  postcode: string | null;
  website: string | null;
  type: string;
  typeGroup: string;
  gender: string | null;
  ageLow: number | null;
  ageHigh: number | null;
  sixthForm: boolean;
  selective: boolean;
  religion: string | null;
  trust: string | null;
  pupils: number | null;
  /** [longitude, latitude] in WGS84, or null if GIAS has no location. */
  lngLat: [number, number] | null;
}

// British National Grid (OSGB36). The 7-parameter Helmert shift is accurate to a few metres,
// which is plenty for placing a school marker.
const BNG =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy ' +
  '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs';
const toWgs84 = proj4(BNG, 'WGS84');

function lngLat(easting: number | null, northing: number | null): [number, number] | null {
  if (!easting || !northing) return null;
  const [lng, lat] = toWgs84.forward([easting, northing]);
  return [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
}

function normaliseWebsite(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Reads the GIAS "all establishments" extract, which is Windows-1252 encoded. */
export async function loadGias(file: string): Promise<Map<number, GiasSchool>> {
  const schools = new Map<number, GiasSchool>();

  for await (const row of readCsv(file, 'windows-1252')) {
    const urn = num(row.URN);
    if (urn === null) continue;
    const status = row['EstablishmentStatus (name)'] ?? '';
    const ageHigh = num(row.StatutoryHighAge);
    // Independent schools are usually "Not applicable", so fall back to the age range
    const sixthFormFlag = row['OfficialSixthForm (name)'];
    const sixthForm =
      sixthFormFlag === 'Has a sixth form' || (sixthFormFlag !== 'Does not have a sixth form' && (ageHigh ?? 0) >= 18);

    schools.set(urn, {
      urn,
      name: row.EstablishmentName.trim(),
      // "Open, but proposed to close" still takes pupils
      open: status.startsWith('Open'),
      la: row['LA (name)'].trim(),
      town: text(row.Town),
      postcode: text(row.Postcode),
      website: normaliseWebsite(text(row.SchoolWebsite)),
      type: row['TypeOfEstablishment (name)'].trim(),
      typeGroup: row['EstablishmentTypeGroup (name)'].trim(),
      gender: text(row['Gender (name)']),
      ageLow: num(row.StatutoryLowAge),
      ageHigh,
      sixthForm,
      selective: row['AdmissionsPolicy (name)'] === 'Selective',
      religion: text(row['ReligiousCharacter (name)']),
      trust: text(row['Trusts (name)']),
      pupils: num(row.NumberOfPupils),
      lngLat: lngLat(num(row.Easting), num(row.Northing)),
    });
  }

  return schools;
}
