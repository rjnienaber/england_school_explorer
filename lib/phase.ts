// The phases of education the explorer maps. Each phase is a separate dataset (its own schools, core.json,
// mode columns and popup shards), so a visitor only downloads the phase they look at. Pure code with no
// imports: the build, the exporter and the browser all use it.

export const PHASES = ['secondary', 'primary'] as const;
export type Phase = (typeof PHASES)[number];

/** The phase the site opens in, and the one every module belongs to unless it says otherwise. */
export const DEFAULT_PHASE: Phase = 'secondary';

export const isPhase = (value: unknown): value is Phase => PHASES.includes(value as Phase);

/** Where a phase's data files live relative to dist/data: the default phase keeps the original paths (old links and caches). */
export const phaseDir = (phase: Phase) => (phase === DEFAULT_PHASE ? '' : `${phase}/`);

/** The phases a module (or a UI item) applies to, from its optional `phases`. */
export const phasesOf = (declared: readonly Phase[] | undefined): readonly Phase[] => declared ?? [DEFAULT_PHASE];
