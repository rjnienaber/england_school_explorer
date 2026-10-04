import { eesCsvUrl } from '../../lib/ees.ts';
import type { SourceDef } from '../../lib/dimension.ts';

export const sources: SourceDef[] = [
  {
    id: 'ks4',
    describe: 'DfE key stage 4 performance, institution-level data set',
    homepage: 'https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance',
    publisher: 'Department for Education',
    licence: 'OGL v3',
    updated: 'annually (provisional in autumn, revised in spring)',
    usedFor: 'Attainment 8, Progress 8 with confidence intervals, English and maths grade 5+, EBacc entry, cohort size, % disadvantaged',
    notes:
      'Three years per file (currently 2022/23 to 2024/25). `z` and `c` mark missing or suppressed values. ' +
      'The older compare-school-performance download blocks scripted access.',
    // "Key stage 4 institution level - Schools (performance)", 2022/23 onwards. This data-set id stays the same as new years are added.
    resolve: async () => eesCsvUrl('5b3d308c-da72-467f-b2ef-ab77d576a455'),
  },
];
