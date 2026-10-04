// The headline subjects, shared by parse.ts, build.ts and web.ts. Each has a short code, which is how a school's
// subjects are stored ("FRE:45,CS:20"), the name the DfE uses for it in the file (its "subject discount group"), and
// the name shown on screen.

export interface SubjectDef {
  code: string;
  /** `subject_discount_group` in the DfE file. */
  group: string;
  label: string;
  /** Languages are listed by name; the rest are shown as chips. */
  language?: boolean;
  /** Other qualification than the GCSE (the DfE file also has this one, which is how "further maths" shows up). */
  qualification?: string;
}

export const FSMQ = 'Free standing Maths Qual Level 3';

/** In the order they are shown. */
export const SUBJECTS: SubjectDef[] = [
  { code: 'FRE', group: 'French Language', label: 'French', language: true },
  { code: 'SPA', group: 'Spanish', label: 'Spanish', language: true },
  { code: 'GER', group: 'German', label: 'German', language: true },
  { code: 'LAT', group: 'Latin', label: 'Latin', language: true },
  { code: 'ITA', group: 'Italian', label: 'Italian', language: true },
  { code: 'CHI', group: 'Chinese', label: 'Chinese', language: true },
  { code: 'ARA', group: 'Arabic', label: 'Arabic', language: true },
  { code: 'URD', group: 'Urdu', label: 'Urdu', language: true },
  { code: 'POL', group: 'Polish', label: 'Polish', language: true },
  { code: 'RUS', group: 'Russian', label: 'Russian', language: true },
  { code: 'POR', group: 'Portuguese', label: 'Portuguese', language: true },
  { code: 'TUR', group: 'Turkish', label: 'Turkish', language: true },
  { code: 'JPN', group: 'Japanese Language', label: 'Japanese', language: true },
  { code: 'GRE', group: 'Greek', label: 'Modern Greek', language: true },
  { code: 'CGR', group: 'Greek (Classic)', label: 'Classical Greek', language: true },
  { code: 'PAN', group: 'Punjabi', label: 'Punjabi', language: true },
  { code: 'PER', group: 'Persian Language', label: 'Persian', language: true },
  { code: 'BEN', group: 'Bengali', label: 'Bengali', language: true },
  { code: 'GUJ', group: 'Gujarati', label: 'Gujarati', language: true },
  { code: 'HEB', group: 'Hebrew Language', label: 'Hebrew', language: true },
  { code: 'CS', group: 'Computer Science', label: 'Computer science' },
  { code: 'BIO', group: 'Biology', label: 'Biology' },
  { code: 'CHE', group: 'Chemistry (General)', label: 'Chemistry' },
  { code: 'PHY', group: 'Physics (General)', label: 'Physics' },
  { code: 'STA', group: 'Statistics', label: 'Statistics' },
  { code: 'FM', group: 'Additional Maths (FSMQ)', label: 'Further maths (Level 3 free-standing)', qualification: FSMQ },
  { code: 'MUS', group: 'Music Studies (General)', label: 'Music' },
  { code: 'ART', group: 'Art & Design', label: 'Art and design' },
  { code: 'DRA', group: 'Speech & Drama', label: 'Drama' },
  { code: 'DAN', group: 'Dance: General', label: 'Dance' },
  { code: 'DT', group: 'D & T', label: 'Design and technology' },
  { code: 'FOO', group: 'Food Technology', label: 'Food and nutrition' },
  { code: 'BUS', group: 'Business Studies', label: 'Business' },
  { code: 'CLA', group: 'Classical Civilisation', label: 'Classical civilisation' },
  { code: 'PSY', group: 'Psychology (General)', label: 'Psychology' },
];

export const SUBJECT_BY_CODE = new Map(SUBJECTS.map((s) => [s.code, s]));
export const LANGUAGE_CODES = SUBJECTS.filter((s) => s.language).map((s) => s.code);

/** Codes the "Offers GCSE" filter can pick, plus LANG: any language. */
export const FILTER_CODES = ['FRE', 'SPA', 'GER', 'LAT', 'ITA', 'CHI', 'CS', 'STA', 'FM', 'MUS', 'DRA', 'ART'];

/** "FRE:45,CS:20" <-> Map. Percent of the year group entered. */
export function encodeEntries(entries: Map<string, number>): string {
  return SUBJECTS.filter((s) => entries.has(s.code)).map((s) => `${s.code}:${entries.get(s.code)}`).join(',');
}

export function decodeEntries(text: string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of (text ?? '').split(',')) {
    const [code, pct] = part.split(':');
    if (code && SUBJECT_BY_CODE.has(code) && pct !== undefined && Number.isFinite(Number(pct))) out.set(code, Number(pct));
  }
  return out;
}
