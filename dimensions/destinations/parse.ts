import { academicYear } from '../../lib/ees.ts';
import { num, readCsv, text } from '../../lib/csv.ts';

export interface DestinationsRow {
  /** Leaver year as an academic year label, e.g. "2022/23" (the year they finished Year 11). */
  year: string;
  /** Pupils who finished Year 11 that year. */
  cohort: number;
  /** % in any sustained destination (education, apprenticeship or work for the following autumn and spring). */
  sustained: number | null;
  /** % in a school sixth form. */
  schoolSixth: number | null;
  /** % in a sixth form college. */
  sixthCollege: number | null;
  /** % in a further education college. */
  fe: number | null;
  /** % in an apprenticeship. */
  apprenticeship: number | null;
  /** % in sustained employment (or training). */
  work: number | null;
  /** % with no sustained destination (includes pupils whose destination is unknown). */
  notSustained: number | null;
}

/**
 * Reads the latest leaver year's all-pupils percentage rows of "Key stage 4 leavers institution level destinations".
 * The file has several years, alternative provision and special schools, a `Number of students` and a `Percentage`
 * row per breakdown, and breakdowns by disadvantage and sex; only `Total`/`Percentage` is kept. The cohort size
 * is repeated as a count in those rows. `overall` is the sustained share, and (checked) overall + all_notsust +
 * all_unknown = 100, so "not sustained" here is all_notsust only and unknown is the remainder; `education` is
 * fe + ssf + sfc + other_edu, which the popup splits.
 */
export async function loadDestinations(file: string): Promise<Map<number, DestinationsRow>> {
  const bySchool = new Map<number, { period: string; row: DestinationsRow }>();
  let latest = '';
  for await (const r of readCsv(file)) {
    if (r.breakdown_topic !== 'Total' || r.data_type !== 'Percentage') continue;
    if (text(r.institution_group) !== 'State-funded mainstream schools') continue;
    const urn = num(r.school_urn);
    const period = r.time_period;
    const cohort = num(r.cohort);
    if (urn === null || !period || !cohort) continue;
    if (period > latest) latest = period;
    const have = bySchool.get(urn);
    if (have && have.period >= period) continue;
    bySchool.set(urn, {
      period,
      row: {
        year: academicYear(period),
        cohort,
        sustained: num(r.overall),
        schoolSixth: num(r.ssf),
        sixthCollege: num(r.sfc),
        fe: num(r.fe),
        apprenticeship: num(r.appren),
        work: num(r.all_work),
        notSustained: num(r.all_notsust),
      },
    });
  }
  // A school that closed or stopped reporting earlier would otherwise show an old year next to current ones
  const out = new Map<number, DestinationsRow>();
  for (const [urn, { period, row }] of bySchool) if (period === latest) out.set(urn, row);
  return out;
}
