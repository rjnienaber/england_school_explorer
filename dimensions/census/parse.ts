import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import { academicYear } from '../../lib/ees.ts';
import { num, type Row } from '../../lib/csv.ts';

export interface CensusRow {
  /** Academic year of the January census, e.g. "2025/26". */
  year: string;
  /** Pupils on roll (headcount). */
  pupils: number;
  /** % of pupils eligible for free school meals. */
  fsmPct: number | null;
  /** % of pupils whose first language is known or believed to be other than English. */
  ealPct: number | null;
}

// Only these phases are kept: the file also holds primary, nursery, special and alternative provision schools
const PHASES = new Set(['State-funded secondary', 'Independent school']);

// A row is wanted only if it has sex = Total and attendance pattern = Total next to each other, followed by one of the
// topics below. Checking the text of the line before parsing it skips over 99% of the 2.8 GB file cheaply:
// parsing every row with csv-parse took nearly four minutes, this takes under a minute.
const WANTED = ['"Total","Total","Total","Total"', '"Total","Total","Free school meal status"', '"Total","Total","First language"'];

/** Streams the file as csv rows, but only parses the lines that could be wanted (plus the header). */
async function* wantedRows(file: string): AsyncGenerator<Row> {
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf-8' }), crlfDelay: Infinity });
  let first = true;
  async function* kept() {
    for await (const line of lines) {
      if (first || WANTED.some((w) => line.includes(w))) yield line + '\n';
      first = false;
    }
  }
  yield* Readable.from(kept()).pipe(parse({ columns: true, bom: true, relax_column_count: true })) as AsyncIterable<Row>;
}

/**
 * Reads "Schools, pupils and their characteristics: School level". It is long format and huge (2.8 GB), so rows are
 * dropped as early as possible and only three figures per school are kept. Rows used (all with sex = Total and
 * attendance pattern = Total):
 *   - Total / Total: the headcount (pupil_count)
 *   - Free school meal status / "FSM eligible": pupil_percent (eligible on census day, taking the meal or not)
 *   - First language / "First language other than English": pupil_percent
 * A school with a headcount but suppressed percentages still gets a row, with null percentages.
 * The URN column is sometimes written in scientific notation ("1e+05" for 100000), which num() reads correctly.
 */
export async function loadCensus(file: string): Promise<Map<number, CensusRow>> {
  const bySchool = new Map<number, { period: string; pupils: number | null; fsmPct: number | null; ealPct: number | null }>();
  for await (const r of wantedRows(file)) {
    if (r.sex !== 'Total' || r.attendance_pattern !== 'Total') continue;
    const topic = r.breakdown_topic;
    if (topic !== 'Total' && topic !== 'Free school meal status' && topic !== 'First language') continue;
    if (!PHASES.has(r.phase_type_grouping)) continue;
    const urn = num(r.school_urn);
    if (urn === null) continue;
    let s = bySchool.get(urn);
    if (!s) bySchool.set(urn, (s = { period: r.time_period, pupils: null, fsmPct: null, ealPct: null }));
    if (topic === 'Total') s.pupils = num(r.pupil_count);
    else if (topic === 'Free school meal status' && r.breakdown === 'FSM eligible') s.fsmPct = num(r.pupil_percent);
    else if (topic === 'First language' && r.breakdown === 'First language other than English') s.ealPct = num(r.pupil_percent);
  }
  const out = new Map<number, CensusRow>();
  let latest = '';
  for (const s of bySchool.values()) if (s.period > latest) latest = s.period;
  for (const [urn, s] of bySchool) {
    if (s.period !== latest || !s.pupils) continue;
    out.set(urn, { year: academicYear(s.period), pupils: s.pupils, fsmPct: s.fsmPct, ealPct: s.ealPct });
  }
  return out;
}

