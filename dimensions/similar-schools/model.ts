// "Similar schools": our own grouping of schools with a similar intake. Pure code with no build
// framework, so it is easy to test and to reuse (the shortlist comparison reads the result).
// README "Similar schools" has the plain-English version.

/** What the grouping knows about one school. Schools with a missing number are left out. */
export interface Candidate {
  urn: number;
  selective: boolean;
  /** 'Mixed', 'Girls' or 'Boys' */
  gender: string;
  disadvantagedPct: number;
  /** English as an additional language, whole school (%). */
  ealPct: number;
  /** Share (%) of the year group who were low or high attainers at the end of primary school. */
  priorLowPct: number;
  priorHighPct: number;
  pupils: number;
  rural: boolean;
}

/** How many similar schools each school gets. */
export const SIMILAR_COUNT = 20;

/** How far apart (in standard deviations) a rural school and an urban one count as being. */
export const RURAL_MISMATCH = 1;

/**
 * The numbers schools are compared on, as they appear in the README and the popup. Each one is
 * rescaled so that one standard deviation (the typical gap between two schools) counts the same.
 */
const MEASURES: { label: string; value(c: Candidate): number }[] = [
  { label: 'disadvantaged pupils', value: (c) => c.disadvantagedPct },
  { label: 'English as an additional language', value: (c) => c.ealPct },
  { label: 'low prior attainers', value: (c) => c.priorLowPct },
  { label: 'high prior attainers', value: (c) => c.priorHighPct },
  { label: 'size', value: (c) => Math.log(Math.max(c.pupils, 1)) },
];
export const MEASURE_LABELS = MEASURES.map((m) => m.label);

const kind = (c: Candidate) => `${c.selective ? 'selective' : 'comprehensive'}/${c.gender}`;

/**
 * For each school, its `count` nearest schools: the same kind (selective or not, and boys, girls or
 * mixed), closest on the standardised intake measures above, with a fixed gap for a rural school
 * against an urban one. Nearest first. A school is never its own neighbour. A kind with fewer than
 * `count + 1` schools gives each of them all the others. Not symmetrical: B can be among A's nearest
 * without A being among B's.
 */
export function findSimilar(candidates: readonly Candidate[], count = SIMILAR_COUNT): Map<number, number[]> {
  const mean = MEASURES.map((m) => candidates.reduce((s, c) => s + m.value(c), 0) / candidates.length);
  const sd = MEASURES.map((m, j) => {
    const v = candidates.reduce((s, c) => s + (m.value(c) - mean[j]) ** 2, 0) / candidates.length;
    return Math.sqrt(v) || 1;
  });
  const point = (c: Candidate) => MEASURES.map((m, j) => (m.value(c) - mean[j]) / sd[j]);

  const groups = new Map<string, { c: Candidate; x: number[] }[]>();
  for (const c of candidates) {
    const g = groups.get(kind(c)) ?? [];
    g.push({ c, x: point(c) });
    groups.set(kind(c), g);
  }

  const out = new Map<number, number[]>();
  for (const group of groups.values()) {
    for (const a of group) {
      const scored = group
        .filter((b) => b.c.urn !== a.c.urn)
        .map((b) => {
          let d2 = a.c.rural === b.c.rural ? 0 : RURAL_MISMATCH ** 2;
          for (let j = 0; j < a.x.length; j++) d2 += (a.x[j] - b.x[j]) ** 2;
          return { urn: b.c.urn, d2 };
        })
        // Ties (identical schools) broken by URN so a rebuild gives the same answer
        .sort((p, q) => p.d2 - q.d2 || p.urn - q.urn);
      out.set(a.c.urn, scored.slice(0, count).map((s) => s.urn));
    }
  }
  return out;
}
