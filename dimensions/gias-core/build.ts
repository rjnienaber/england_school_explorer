// The scope module: decides which schools are on the map, and holds identity, location and
// school-type fields from the GIAS register. Every other module joins to the schools found here.

import { defineDimension, type BuildContext } from '../../lib/dimension.ts';
import { num } from '../../lib/csv.ts';
import { loadGias, type GiasSchool } from './parse.ts';

const MAINSTREAM_STATE_GROUPS = new Set(['Academies', 'Free Schools', 'Local authority maintained schools']);

/** GIAS phases that make up the primary dataset. Independent schools have no phase in GIAS, so none are included. */
const PRIMARY_PHASES = new Set(['Primary', 'Middle deemed primary']);

/** Mainstream state and independent schools; excludes special schools, alternative provision and colleges. */
function sectorOf(gias: GiasSchool): 'state' | 'independent' | null {
  if (/special/i.test(gias.type)) return null;
  if (MAINSTREAM_STATE_GROUPS.has(gias.typeGroup)) return 'state';
  if (gias.typeGroup === 'Independent schools') return 'independent';
  return null;
}

const rowOf = (g: GiasSchool, sector: 'state' | 'independent') => ({
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
});

function buildPrimary(ctx: BuildContext, gias: Map<number, GiasSchool>) {
  const skipped = { closed: 0, noLocation: 0 };
  const rows = [];
  const locations = [];
  for (const g of gias.values()) {
    if (!PRIMARY_PHASES.has(g.phase) || sectorOf(g) !== 'state') continue;
    if (!g.open) skipped.closed++;
    else if (!g.lngLat) skipped.noLocation++;
    else {
      rows.push(rowOf(g, 'state'));
      locations.push({ urn: g.urn, lng: g.lngLat[0], lat: g.lngLat[1] });
    }
  }
  ctx.log(`GIAS: ${gias.size} establishments; kept ${rows.length} primary schools; skipped ${JSON.stringify(skipped)}`);
  return { rows, locations };
}

export const module = defineDimension({
  id: 'gias-core',
  title: 'School identity and type (GIAS)',
  scope: true,
  phases: ['secondary', 'primary'],
  fields: {
    name: { type: 'string', placement: 'core', label: 'Name', source: 'gias', nullable: false, default: '' },
    la: { type: 'string', placement: 'core', label: 'Local authority', source: 'gias', nullable: false, default: '' },
    town: { type: 'string', placement: 'core', label: 'Town', source: 'gias' },
    postcode: { type: 'string', placement: 'detail', label: 'Postcode', source: 'gias' },
    website: { type: 'string', placement: 'detail', label: 'Website', source: 'gias' },
    sector: {
      type: 'enum',
      values: ['state', 'independent'],
      placement: 'core',
      label: 'Sector',
      description: 'State-funded mainstream or independent',
      source: 'gias',
      nullable: false,
      default: 'state',
    },
    type: { type: 'string', placement: 'detail', label: 'Type of establishment', source: 'gias', nullable: false, default: '' },
    gender: { type: 'string', placement: 'core', label: 'Pupil gender', description: 'Mixed, Girls or Boys', source: 'gias' },
    ageLow: { type: 'number', placement: 'detail', label: 'Lowest age', source: 'gias' },
    ageHigh: { type: 'number', placement: 'detail', label: 'Highest age', source: 'gias' },
    sixthForm: { type: 'boolean', placement: 'core', label: 'Has a sixth form', source: 'gias', nullable: false, default: false },
    selective: { type: 'boolean', placement: 'core', label: 'Selective (grammar)', source: 'gias', nullable: false, default: false },
    religion: { type: 'string', placement: 'detail', label: 'Religious character', source: 'gias' },
    // 'mode', not 'detail': the trust view's chip reads the name once a trust is chosen (see dimensions/trust)
    trust: { type: 'string', placement: 'mode', label: 'Multi-academy trust', description: 'Name of the trust that runs the school', source: 'gias' },
    pupils: { type: 'number', placement: 'detail', label: 'Pupils on roll', source: 'gias' },
  },

  async build(ctx) {
    const gias = await loadGias(ctx.dataPath('gias'));
    // Primary: every open state-funded mainstream school GIAS calls a primary. Secondary: those with KS4 results (below).
    if (ctx.phase === 'primary') return buildPrimary(ctx, gias);

    // In scope = has KS4 results data (the DfE file lists every school with a GCSE cohort,
    // including ones with no published scores), then the sector rules above.
    const ks4Urns = new Set<number>();
    for await (const row of ctx.csv('ks4')) {
      if (row.breakdown !== 'Total' && row.breakdown !== 'Disadvantaged') continue;
      const urn = num(row.school_urn);
      if (urn !== null) ks4Urns.add(urn);
    }

    const skipped = { closed: 0, noLocation: 0, outOfScope: 0, notInGias: 0 };
    const rows = [];
    const locations = [];
    for (const urn of ks4Urns) {
      const g = gias.get(urn);
      if (!g) {
        skipped.notInGias++;
        continue;
      }
      const sector = sectorOf(g);
      if (!sector) skipped.outOfScope++;
      else if (!g.open) skipped.closed++;
      else if (!g.lngLat) skipped.noLocation++;
      else {
        rows.push(rowOf(g, sector));
        locations.push({ urn, lng: g.lngLat[0], lat: g.lngLat[1] });
      }
    }
    ctx.log(`GIAS: ${gias.size} establishments; kept ${rows.length} schools; skipped ${JSON.stringify(skipped)}`);
    return { rows, locations };
  },
});
