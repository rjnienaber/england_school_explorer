import type { FilterDef, PopupSectionDef } from '../../web/toolkit.ts';
import { FIFTH_LABELS, fifthOf } from './bands.ts';

export const filters: FilterDef[] = [
  {
    id: 'deprivation',
    order: 160,
    control: {
      kind: 'select',
      label: 'Area deprivation',
      options: [{ value: '', label: 'Any' }, ...FIFTH_LABELS.map((label, i) => ({ value: String(i + 1), label }))],
    },
    default: '',
    // Schools with no neighbourhood match only show under "Any"
    test: (p, value) => !value || (p.idaciDecile !== null && String(fifthOf(p.idaciDecile)) === value),
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'deprivation',
    order: 70,
    title: 'Area deprivation',
    render: (p, h) => {
      if (p.idaciDecile === null) return null;
      // The raw score is left out: 2025 counts more families as income deprived than 2019 did, so a bare percentage misleads. The rank is what matters.
      return h.html`${h.rows([['Neighbourhood', `${FIFTH_LABELS[fifthOf(p.idaciDecile) - 1]} of England (decile ${p.idaciDecile} of 10)`]])}${h.note('Income Deprivation Affecting Children Index, English Indices of Deprivation 2025. It describes the area around the school, not its pupils.')}`;
    },
  },
];
