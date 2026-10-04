import type { FilterDef, PopupTagDef } from '../../web/toolkit.ts';

export const filters: FilterDef[] = [
  {
    id: 'boarding',
    group: 'type',
    order: 140,
    control: { kind: 'checkbox', label: 'Boarding schools only' },
    default: false,
    test: (p, on) => !on || p.boarding,
  },
];

export const popupTags: PopupTagDef[] = [{ id: 'boarding', order: 35, tag: (p) => (p.boarding ? { text: 'Boarding' } : null) }];
