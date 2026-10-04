// Neighbourhood deprivation: the Income Deprivation Affecting Children Index (IDACI) from the English
// Indices of Deprivation 2025, for the small area (LSOA) each school stands in. The register gives each
// school's LSOA, so no postcode lookup is needed. Other modules (the intake model) can read the decile
// and score through `ctx.read('deprivation')`.

import { defineDimension } from '../../lib/dimension.ts';
import { loadIdaci, loadLsoaCodes } from './parse.ts';

export const module = defineDimension({
  id: 'deprivation',
  title: 'Area deprivation (IDACI)',
  dependsOn: ['gias-core'],
  fields: {
    idaciDecile: {
      type: 'number',
      decimals: 0,
      placement: 'mode',
      label: 'Area deprivation decile (IDACI)',
      description:
        'Decile of the Income Deprivation Affecting Children Index (English Indices of Deprivation 2025) for the neighbourhood (LSOA, about 1,500 people) the school stands in, among all neighbourhoods in England. 1 is the most deprived tenth, 10 the least deprived. It describes the school\'s location, not its pupils\' home addresses, and applies to independent schools too. Not set where the register has no 2021 neighbourhood code for the school.',
      source: 'iod2025',
    },
    idaciScorePct: {
      type: 'number',
      decimals: 1,
      unit: '%',
      placement: 'detail',
      label: 'Children in income-deprived families in the area (IDACI score)',
      description:
        'The IDACI score of the school\'s neighbourhood (English Indices of Deprivation 2025): the share of children aged 0 to 15 there living in families that are income deprived, as a percentage. Higher means more deprived. The 2025 edition counts more families as income deprived than 2019 did (the median neighbourhood is about 30%), so compare neighbourhoods by rank or decile, not against 2019 figures. Describes the area, not the school\'s pupils.',
      source: 'iod2025',
    },
  },

  async build(ctx) {
    const [idaci, lsoa] = await Promise.all([loadIdaci(ctx.dataPath('iod2025')), loadLsoaCodes(ctx.dataPath('gias'))]);
    const rows = [];
    for (const urn of ctx.schools.urns) {
      const code = lsoa.get(urn);
      const d = code ? idaci.get(code) : undefined;
      if (d) rows.push({ urn, idaciDecile: d.decile, idaciScorePct: d.scorePct });
    }
    ctx.log(`${rows.length} of ${ctx.schools.urns.size} schools matched to a neighbourhood (${idaci.size} neighbourhoods in IoD 2025)`);
    return rows;
  },
});
