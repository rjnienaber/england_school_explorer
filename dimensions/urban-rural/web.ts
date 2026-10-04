import type { FilterDef, PopupSectionDef } from '../../web/toolkit.ts';

export const filters: FilterDef[] = [
  {
    id: 'urbanRural',
    order: 130,
    control: {
      kind: 'select',
      label: 'Area',
      options: [
        { value: '', label: 'Any' },
        { value: 'urban', label: 'Urban' },
        { value: 'rural', label: 'Rural' },
      ],
    },
    default: '',
    // Schools with no classification only show under "Any"
    test: (p, value) => !value || p.urbanRural === value,
  },
];

// The popup has no hook for the grey line under the name, so this is an untitled line of its own
export const popupSections: PopupSectionDef[] = [
  {
    id: 'urban-rural',
    order: 5,
    render: (p, h) => (p.urbanRuralDetail === null ? null : h.meta(p.urbanRuralDetail)),
  },
];
