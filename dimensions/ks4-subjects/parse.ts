import { num, readCsv } from '../../lib/csv.ts';
import { academicYear } from '../../lib/ees.ts';
import { SUBJECTS } from './subjects.ts';

export interface SchoolSubjects {
  year: string;
  /** Subject code -> entries as a percentage of the year group (1-100), for the subjects with any entries. */
  entries: Map<string, number>;
}

/**
 * Reads the subject entries file (one row per school, subject and qualification, total entries).
 * A subject with entries but no usable year-group size (both suppressed with `c` / `z`) is skipped: we cannot give a share.
 * Entries can exceed the year group (pupils who take a subject early or again, or a different year), so shares stop at 100.
 */
export async function loadSubjects(file: string): Promise<Map<number, SchoolSubjects>> {
  const wanted = new Map(SUBJECTS.map((s) => [`${s.qualification ?? 'GCSE'}|${s.group}`, s.code]));
  const schools = new Map<number, SchoolSubjects>();

  for await (const row of readCsv(file)) {
    const urn = num(row.school_urn);
    if (urn === null) continue;
    const qualification = row.qualification_detailed.startsWith('GCSE') ? 'GCSE' : row.qualification_detailed;
    const code = wanted.get(`${qualification}|${row.subject_discount_group}`);
    if (!code) continue;
    const entries = num(row.number_achieving);
    const pupils = num(row.pupil_count);
    if (entries === null || entries <= 0 || pupils === null || pupils <= 0) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = { year: academicYear(row.time_period), entries: new Map() }));
    // Never 0 for a subject that is entered at all, so "entered" and "offered" agree
    school.entries.set(code, Math.min(100, Math.max(1, Math.round((100 * entries) / pupils))));
  }
  return schools;
}
