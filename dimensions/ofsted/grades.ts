// Ofsted grade vocabularies, shared by the build and the browser.

/** New (Nov 2025+) report-card grades, best to worst. */
export const REPORT_CARD_GRADES = ['Exceptional', 'Strong standard', 'Expected standard', 'Needs attention', 'Urgent improvement'] as const;
export type ReportCardGrade = (typeof REPORT_CARD_GRADES)[number];

/** Old framework (OEIF) grades 1-4. */
export const OEIF_GRADES = { 1: 'Outstanding', 2: 'Good', 3: 'Requires improvement', 4: 'Inadequate' } as const;
export type OeifGrade = keyof typeof OEIF_GRADES;

/**
 * A single four-level summary so schools inspected under either framework can share
 * one map colour, best first. This is our own simplification, not an Ofsted grade.
 */
export const OFSTED_SUMMARIES = ['top', 'good', 'concern', 'serious'] as const;
export type OfstedSummary = (typeof OFSTED_SUMMARIES)[number];

export const OFSTED_FRAMEWORKS = ['report-card', 'oeif', 'ungraded'] as const;
