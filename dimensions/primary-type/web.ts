import type { FilterDef } from '../../web/toolkit.ts';

export const filters: FilterDef[] = [
  {
    id: 'primaryType',
    group: 'type',
    order: 60,
    control: {
      kind: 'select',
      label: 'Age range',
      options: [
        { value: '', label: 'Any' },
        { value: 'infant', label: 'Infant (up to age 7)' },
        { value: 'junior', label: 'Junior (from age 7)' },
        { value: 'all', label: 'Infant and junior together' },
      ],
    },
    default: '',
    test: (p, value) => !value || p.primaryType === value,
  },
];
