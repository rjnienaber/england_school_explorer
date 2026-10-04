// The seven subject areas, shared by build.ts (fields), parse.ts (columns) and web.ts (popup).

/** Progress 8 elements: the four baskets of subjects that make up Progress 8. */
export const P8_ELEMENTS = ['Eng', 'Maths', 'Ebacc', 'Open'] as const;
export type P8Element = (typeof P8_ELEMENTS)[number];

/** Value-added areas: science, humanities and languages (EBacc subjects, scored per pupil entered). */
export const VA_AREAS = ['Sci', 'Hum', 'Lan'] as const;
export type VaArea = (typeof VA_AREAS)[number];

/** Names as DfE uses them. */
export const P8_ELEMENT_LABELS: Record<P8Element, string> = {
  Eng: 'English',
  Maths: 'Maths',
  Ebacc: 'EBacc subjects',
  Open: 'Other subjects',
};

export const VA_LABELS: Record<VaArea, string> = {
  Sci: 'Science',
  Hum: 'Humanities',
  Lan: 'Languages',
};

/** Column prefix in the DfE file. */
export const P8_COLUMNS: Record<P8Element, string> = { Eng: 'progress8eng', Maths: 'progress8mat', Ebacc: 'progress8ebacc', Open: 'progress8open' };
export const VA_COLUMNS: Record<VaArea, string> = { Sci: 'valueaddedsci', Hum: 'valueaddedhum', Lan: 'valueaddedlan' };
