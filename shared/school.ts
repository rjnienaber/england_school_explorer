// Shape of each feature's properties in dist/schools.geojson. Shared by the build
// scripts and the browser app. Kept flat because MapLibre style expressions can't
// reach into nested objects. Missing values are null rather than absent.

export type Sector = 'state' | 'independent';

/** DfE Progress 8 bands, derived from the 95% confidence interval. */
export type P8Band = 'well-above' | 'above' | 'average' | 'below' | 'well-below';

/** New (Nov 2025+) report-card grades, best to worst. */
export const REPORT_CARD_GRADES = [
  'Exceptional',
  'Strong standard',
  'Expected standard',
  'Needs attention',
  'Urgent improvement',
] as const;
export type ReportCardGrade = (typeof REPORT_CARD_GRADES)[number];

/** Old framework (OEIF) grades 1–4. */
export const OEIF_GRADES = { 1: 'Outstanding', 2: 'Good', 3: 'Requires improvement', 4: 'Inadequate' } as const;
export type OeifGrade = keyof typeof OEIF_GRADES;

/**
 * A single four-level summary so schools inspected under either framework can share
 * one map colour. This is our own simplification, not an Ofsted grade.
 */
export type OfstedSummary = 'top' | 'good' | 'concern' | 'serious';

export interface SchoolProperties {
  urn: number;
  name: string;
  la: string;
  town: string | null;
  postcode: string | null;
  website: string | null;
  sector: Sector;
  type: string;
  gender: string | null;
  ageLow: number | null;
  ageHigh: number | null;
  sixthForm: boolean;
  selective: boolean;
  religion: string | null;
  trust: string | null;
  pupils: number | null;

  // KS4 – latest year with an Attainment 8 score
  ks4Year: string | null;
  ks4Cohort: number | null;
  disadvantagedPct: number | null;
  att8: number | null;
  att8Prev: number | null;
  att8Prev2: number | null;
  att8Avg: number | null;
  att8Years: number;
  att8Disadvantaged: number | null;
  engMaths5: number | null;
  ebaccEntry: number | null;
  /** Percentile (0–100) of att8 among state-funded mainstream schools. */
  att8Pct: number | null;
  /** att8 minus the score predicted from the cohort's % disadvantaged. */
  att8VsIntake: number | null;
  att8VsIntakePct: number | null;

  // Progress 8 – latest year it was published (not 2024/25 or 2025/26)
  p8Year: string | null;
  p8: number | null;
  p8Lower: number | null;
  p8Upper: number | null;
  p8Band: P8Band | null;

  // Ofsted
  ofstedUrl: string | null;
  /** 'ungraded' = only a short inspection is on file (its graded one predates the 2019 framework). */
  ofstedFramework: 'report-card' | 'oeif' | 'ungraded' | null;
  ofstedDate: string | null;
  /** True when the latest graded inspection was of a predecessor school (e.g. before academy conversion). */
  ofstedPredecessor: boolean;
  ofstedSummary: OfstedSummary | null;
  rcSafeguarding: string | null;
  rcInclusion: ReportCardGrade | null;
  rcCurriculum: ReportCardGrade | null;
  rcAchievement: ReportCardGrade | null;
  rcAttendance: ReportCardGrade | null;
  rcPersonalDevelopment: ReportCardGrade | null;
  rcPost16: ReportCardGrade | null;
  rcLeadership: ReportCardGrade | null;
  oeifOverall: OeifGrade | null;
  oeifQuality: OeifGrade | null;
  oeifBehaviour: OeifGrade | null;
  oeifPersonalDevelopment: OeifGrade | null;
  oeifLeadership: OeifGrade | null;
  oeifSixthForm: OeifGrade | null;
  oeifDate: string | null;
  ungradedOutcome: string | null;
  ungradedDate: string | null;
}

export interface SchoolFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SchoolProperties;
}

export interface SchoolCollection {
  type: 'FeatureCollection';
  metadata: {
    builtAt: string;
    sources: Record<string, string>;
    ks4Years: string[];
    p8Year: string | null;
    ofstedAsAt: string | null;
  };
  features: SchoolFeature[];
}
