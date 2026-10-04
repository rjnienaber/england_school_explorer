import type { SchoolRecord } from './generated/fields.ts';

export type { SchoolRecord };

export interface SchoolFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SchoolRecord;
}

/** Dataset-level values: builtAt and sources, plus whatever modules add (their `metadata`). */
export type Metadata = { builtAt: string; sources: Record<string, string> } & Record<string, unknown>;
