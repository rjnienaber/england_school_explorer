import type { FilterDef, PopupTagDef } from '../../web/toolkit.ts';
import { dioceseLabel, ethosAddsToCharacter } from './faith.ts';

export const filters: FilterDef[] = [
  {
    id: 'faith',
    group: 'type',
    order: 150,
    control: {
      kind: 'select',
      label: 'Faith schools',
      options: [
        { value: '', label: 'Any' },
        { value: 'faith', label: 'Faith schools only' },
        { value: 'secular', label: 'Non-faith schools only' },
      ],
    },
    default: '',
    test: (p, value) => !value || (value === 'faith') === p.faithSchool,
  },
];

// Replaces the plain religion tag that gias-core used to show: the diocese goes with it
export const popupTags: PopupTagDef[] = [
  {
    id: 'religion',
    order: 40,
    tag: (p) => {
      const parts = [p.religion, p.diocese ? dioceseLabel(p.diocese) : null].filter((s): s is string => !!s);
      return parts.length ? { text: parts.join(' · ') } : null;
    },
  },
  {
    id: 'religious-ethos',
    order: 41,
    tag: (p) => (p.religiousEthos && ethosAddsToCharacter(p.religiousEthos, p.religion) ? { text: `${p.religiousEthos} ethos` } : null),
  },
];
