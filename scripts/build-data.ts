// Joins KS4 results, the GIAS register and Ofsted inspections into dist/schools.geojson.
//
// Usage: node scripts/build-data.ts

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SchoolCollection, SchoolFeature, SchoolProperties, Sector } from '../shared/school.ts';
import { loadGias, type GiasSchool } from './lib/gias.ts';
import { loadKs4, type Ks4School, type Ks4Year } from './lib/ks4.ts';
import { loadOfsted } from './lib/ofsted.ts';
import { linearFit, mean, p8Band, percentileRanker, round } from './lib/stats.ts';
import { DIST_DIR, SOURCES_FILE, dataPath } from './paths.ts';

const MAINSTREAM_STATE_GROUPS = new Set(['Academies', 'Free Schools', 'Local authority maintained schools']);

/** Mainstream state and independent schools; excludes special schools, alternative provision and colleges. */
function sectorOf(gias: GiasSchool, ks4: Ks4School): Sector | null {
  if (/special/i.test(gias.type) || /special/i.test(ks4.typeGroup)) return null;
  if (MAINSTREAM_STATE_GROUPS.has(gias.typeGroup)) return 'state';
  if (gias.typeGroup === 'Independent schools') return 'independent';
  return null;
}

interface Candidate {
  gias: GiasSchool;
  ks4: Ks4School;
  sector: Sector;
  lngLat: [number, number];
}

function latestWith(ks4: Ks4School, years: string[], has: (y: Ks4Year) => boolean): [string, Ks4Year] | null {
  for (const label of years) {
    const year = ks4.years.get(label);
    if (year && has(year)) return [label, year];
  }
  return null;
}

async function readSources(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(SOURCES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/** ".../latest_inspections_as_at_31_August_2026.csv" → "31 August 2026" */
function ofstedAsAt(url: string | undefined): string | null {
  const m = url?.match(/as_at_(\d{1,2})_([A-Za-z]+)_(\d{4})/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : null;
}

async function main(): Promise<void> {
  console.log('Loading source data…');
  const [ks4, gias, ofsted, sources] = await Promise.all([
    loadKs4(dataPath('ks4.csv')),
    loadGias(dataPath('gias.csv')),
    loadOfsted(dataPath('ofsted.csv')),
    readSources(),
  ]);

  const years = [...new Set([...ks4.values()].flatMap((s) => [...s.years.keys()]))].sort().reverse();
  console.log(`  KS4: ${ks4.size} schools, years ${years.join(', ')}`);
  console.log(`  GIAS: ${gias.size} establishments`);
  console.log(`  Ofsted: ${ofsted.size} schools`);

  const candidates: Candidate[] = [];
  const skipped = { closed: 0, noLocation: 0, outOfScope: 0, notInGias: 0 };
  for (const school of ks4.values()) {
    const g = gias.get(school.urn);
    if (!g) {
      skipped.notInGias++;
      continue;
    }
    const sector = sectorOf(g, school);
    if (!sector) skipped.outOfScope++;
    else if (!g.open) skipped.closed++;
    else if (!g.lngLat) skipped.noLocation++;
    else candidates.push({ gias: g, ks4: school, sector, lngLat: g.lngLat });
  }
  console.log(`  Kept ${candidates.length} schools; skipped`, skipped);

  // Percentiles and the intake model are computed per year, among state-funded
  // mainstream schools only: independent schools' scores aren't comparable (IGCSEs
  // don't count towards Attainment 8) and have no disadvantage data.
  const att8Rankers = new Map<string, (v: number) => number>();
  const intakeModels = new Map<string, { predict: (pct: number) => number; residualRank: (v: number) => number }>();
  for (const label of years) {
    const state = candidates
      .filter((c) => c.sector === 'state')
      .map((c) => c.ks4.years.get(label))
      .filter((y): y is Ks4Year => y?.att8 != null);
    if (state.length === 0) continue;
    att8Rankers.set(label, percentileRanker(state.map((y) => y.att8!)));

    // Fit on non-selective schools so grammar schools don't skew the expected score
    const fitPoints = candidates
      .filter((c) => c.sector === 'state' && !c.gias.selective)
      .map((c) => c.ks4.years.get(label))
      .filter((y): y is Ks4Year => y?.att8 != null && y.disadvantagedPct != null)
      .map((y): [number, number] => [y.disadvantagedPct!, y.att8!]);
    const fit = linearFit(fitPoints);
    const predict = (pct: number) => fit.intercept + fit.slope * pct;
    const residuals = state.filter((y) => y.disadvantagedPct != null).map((y) => y.att8! - predict(y.disadvantagedPct!));
    intakeModels.set(label, { predict, residualRank: percentileRanker(residuals) });
    console.log(
      `  ${label}: Att8 ≈ ${fit.intercept.toFixed(1)} ${fit.slope.toFixed(3)}×%disadvantaged ` +
        `(r = ${fit.r.toFixed(2)}, n = ${fitPoints.length})`,
    );
  }

  const features: SchoolFeature[] = candidates.map(({ gias: g, ks4: k, sector, lngLat }) => {
    const latest = latestWith(k, years, (y) => y.att8 !== null);
    const [ks4Year, y] = latest ?? [null, null];
    const att8History = years.map((label) => k.years.get(label)?.att8 ?? null);
    const latestIndex = ks4Year ? years.indexOf(ks4Year) : -1;
    const recentAtt8 = latestIndex >= 0 ? att8History.slice(latestIndex, latestIndex + 3) : [];
    const recentValues = recentAtt8.filter((v) => v !== null);

    const p8 = latestWith(k, years, (yr) => yr.p8 !== null && yr.p8Lower !== null && yr.p8Upper !== null);
    const [p8Year, p8Data] = p8 ?? [null, null];

    const isState = sector === 'state';
    const ranker = ks4Year && isState ? att8Rankers.get(ks4Year) : undefined;
    const model = ks4Year && isState ? intakeModels.get(ks4Year) : undefined;
    const vsIntake = y?.att8 != null && y.disadvantagedPct != null && model ? y.att8 - model.predict(y.disadvantagedPct) : null;

    const o = ofsted.get(g.urn);

    const properties: SchoolProperties = {
      urn: g.urn,
      name: g.name,
      la: g.la,
      town: g.town,
      postcode: g.postcode,
      website: g.website,
      sector,
      type: g.type,
      gender: g.gender,
      ageLow: g.ageLow,
      ageHigh: g.ageHigh,
      sixthForm: g.sixthForm,
      selective: g.selective,
      religion: g.religion,
      trust: g.trust,
      pupils: g.pupils,

      ks4Year,
      ks4Cohort: y?.cohort ?? null,
      disadvantagedPct: y?.disadvantagedPct ?? null,
      att8: y?.att8 ?? null,
      att8Prev: recentAtt8[1] ?? null,
      att8Prev2: recentAtt8[2] ?? null,
      att8Avg: round(mean(recentValues)),
      att8Years: recentValues.length,
      att8Disadvantaged: y?.att8Disadvantaged ?? null,
      engMaths5: y?.engMaths5 ?? null,
      ebaccEntry: y?.ebaccEntry ?? null,
      att8Pct: y?.att8 != null && ranker ? ranker(y.att8) : null,
      att8VsIntake: round(vsIntake),
      att8VsIntakePct: vsIntake !== null && model ? model.residualRank(vsIntake) : null,

      p8Year,
      p8: p8Data?.p8 ?? null,
      p8Lower: p8Data?.p8Lower ?? null,
      p8Upper: p8Data?.p8Upper ?? null,
      p8Band: p8Data ? p8Band(p8Data.p8!, p8Data.p8Lower!, p8Data.p8Upper!) : null,

      ofstedUrl: o?.url ?? null,
      ofstedFramework: o?.framework ?? null,
      ofstedDate: o?.date ?? null,
      ofstedPredecessor: o?.predecessor ?? false,
      ofstedSummary: o?.summary ?? null,
      rcSafeguarding: o?.rc.safeguarding ?? null,
      rcInclusion: o?.rc.inclusion ?? null,
      rcCurriculum: o?.rc.curriculum ?? null,
      rcAchievement: o?.rc.achievement ?? null,
      rcAttendance: o?.rc.attendance ?? null,
      rcPersonalDevelopment: o?.rc.personalDevelopment ?? null,
      rcPost16: o?.rc.post16 ?? null,
      rcLeadership: o?.rc.leadership ?? null,
      oeifOverall: o?.oeif.overall ?? null,
      oeifQuality: o?.oeif.quality ?? null,
      oeifBehaviour: o?.oeif.behaviour ?? null,
      oeifPersonalDevelopment: o?.oeif.personalDevelopment ?? null,
      oeifLeadership: o?.oeif.leadership ?? null,
      oeifSixthForm: o?.oeif.sixthForm ?? null,
      oeifDate: o?.oeif.date ?? null,
      ungradedOutcome: o?.ungradedOutcome ?? null,
      ungradedDate: o?.ungradedDate ?? null,
    };

    return { type: 'Feature', geometry: { type: 'Point', coordinates: lngLat }, properties };
  });

  const p8Years = features.map((f) => f.properties.p8Year).filter((v) => v !== null);
  const collection: SchoolCollection = {
    type: 'FeatureCollection',
    metadata: {
      builtAt: new Date().toISOString(),
      sources,
      ks4Years: years,
      p8Year: p8Years.sort().at(-1) ?? null,
      ofstedAsAt: ofstedAsAt(sources.ofsted),
    },
    features,
  };

  await mkdir(DIST_DIR, { recursive: true });
  const out = join(DIST_DIR, 'schools.geojson');
  await writeFile(out, JSON.stringify(collection));

  const count = (pred: (p: SchoolProperties) => boolean) => features.filter((f) => pred(f.properties)).length;
  console.log(`Wrote ${features.length} schools → ${out}`);
  console.log(
    `  state ${count((p) => p.sector === 'state')}, independent ${count((p) => p.sector === 'independent')}, ` +
      `with Att8 ${count((p) => p.att8 !== null)}, with P8 ${count((p) => p.p8 !== null)}, ` +
      `report card ${count((p) => p.ofstedFramework === 'report-card')}, OEIF ${count((p) => p.ofstedFramework === 'oeif')}`,
  );
}

await main();
