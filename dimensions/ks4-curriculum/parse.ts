import { num, readCsv } from '../../lib/csv.ts';
import { yearLabel } from '../ks4-headline/parse.ts';

export interface Curriculum {
  /** Share of the year group entering triple science (all of biology, chemistry and physics), 0-100. */
  tripleSciencePct: number | null;
  /** Share entering a language GCSE (a language is part of the EBacc), 0-100. */
  languagePct: number | null;
  /** Share entering more than one language, 0-100. */
  multiLanguagePct: number | null;
  /** Share entering history or geography (the EBacc humanities), 0-100. */
  humanitiesPct: number | null;
  /** Average number of GCSEs entered per pupil. */
  gcsesPerPupil: number | null;
}

/** Keyed by academic year label ("2024/25"). */
export type CurriculumSchool = Map<string, Curriculum>;

/** Reads the "Total" rows of the KS4 institution-level file. */
export async function loadCurriculum(file: string): Promise<Map<number, CurriculumSchool>> {
  const schools = new Map<number, CurriculumSchool>();

  for await (const row of readCsv(file)) {
    if (row.breakdown !== 'Total') continue;
    const urn = num(row.school_urn);
    if (urn === null) continue;

    let school = schools.get(urn);
    if (!school) schools.set(urn, (school = new Map()));
    school.set(yearLabel(row.time_period), {
      tripleSciencePct: num(row.sci_triple_entering_percent),
      languagePct: num(row.ebacclan_entering_percent),
      multiLanguagePct: num(row.lan_multiple_entering_percent),
      humanitiesPct: num(row.ebacchum_entering_percent),
      gcsesPerPupil: num(row.gcse_entries_average),
    });
  }

  return schools;
}
