// Types of special educational need, as GIAS names them ("ASD - Autistic Spectrum Disorder").
// Shared by build.ts and web.ts, so no Node APIs here.

/** Short code -> plain-words label, in the order they are listed in the filter. */
export const SEN_NEEDS: Record<string, string> = {
  ASD: 'Autism (ASD)',
  SLCN: 'Speech, language and communication',
  SEMH: 'Social, emotional and mental health',
  MLD: 'Moderate learning difficulty',
  SLD: 'Severe learning difficulty',
  PMLD: 'Profound and multiple learning difficulty',
  SpLD: 'Specific learning difficulty (e.g. dyslexia)',
  PD: 'Physical disability',
  HI: 'Hearing impairment',
  VI: 'Visual impairment',
  MSI: 'Multi-sensory impairment',
  OTH: 'Other difficulty or disability',
};

/** "ASD - Autistic Spectrum Disorder" -> "ASD". Returns null for blanks, "Not Applicable" and unknown codes. */
export function needCode(gias: string | null | undefined): string | null {
  const code = (gias ?? '').split(' - ')[0].trim();
  return code in SEN_NEEDS ? code : null;
}

/** The stored comma-separated codes as labels, in the filter's order. */
export function needLabels(codes: string | null): string[] {
  const have = new Set((codes ?? '').split(',').filter(Boolean));
  return Object.keys(SEN_NEEDS).filter((c) => have.has(c)).map((c) => SEN_NEEDS[c]);
}
