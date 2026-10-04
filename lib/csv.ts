import { createReadStream } from 'node:fs';
import { Transform } from 'node:stream';
import { parse } from 'csv-parse';

export type Row = Record<string, string>;

/** Streams a CSV file as objects keyed by header. `encoding` is any WHATWG label, e.g. 'windows-1252'. */
export async function* readCsv(file: string, encoding = 'utf-8'): AsyncGenerator<Row> {
  const decoder = new TextDecoder(encoding);
  const decode = new Transform({
    transform(chunk: Buffer, _enc, done) {
      done(null, decoder.decode(chunk, { stream: true }));
    },
    flush(done) {
      done(null, decoder.decode());
    },
  });
  const parser = createReadStream(file).pipe(decode).pipe(parse({ columns: true, bom: true, relax_column_count: true }));
  yield* parser as AsyncIterable<Row>;
}

const MISSING = new Set(['', 'NULL', 'NA', 'N/A', 'Not applicable', 'Does not apply', 'None']);

/** Trims a text field, mapping the various "no value" spellings to null. */
export function text(value: string | undefined): string | null {
  const v = value?.trim();
  return v && !MISSING.has(v) ? v : null;
}

/**
 * Parses a numeric field. DfE uses letter codes for missing values
 * (z = not applicable, c = suppressed, x = unavailable, low = below 0.5%),
 * which all become null.
 */
export function num(value: string | undefined): number | null {
  const v = value?.trim().replace(/%$/, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
