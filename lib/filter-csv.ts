// Downloads a big CSV and stores only the rows and columns we use. The file is streamed through the parser, so the
// large file never exists on disk (or in memory): what lands in data/ is already the shape `parse.ts` reads.
import { createWriteStream } from 'node:fs';
import { rename } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { once } from 'node:events';
import { parse } from 'csv-parse';
import { openUrl } from './download.ts';
import { csvCell } from './csv.ts';

type Row = Record<string, string>;

export interface FilteredCsvOptions {
  /** Columns to write, in this order. Each must exist in the file (a missing one throws, so a renamed column is noticed). */
  columns: string[];
  /** Rows to keep. Default: all. */
  keep?: (row: Row) => boolean;
  /**
   * Keep only the newest `time_period` among the kept rows. Works whatever the order of the file (it holds the newest
   * year's rows in memory and starts again if a newer year turns up). Needs `time_period` in `columns`.
   * - 'any' reads the whole file;
   * - 'newest-first' is for files that list the newest year first (EES files usually do). The transfer is stopped when
   *   an older year starts, which skips most of the download, and a newer year after an older one throws rather
   *   than quietly keeping the wrong year.
   */
  latestPeriod?: 'any' | 'newest-first';
  /** Text encoding of the file, as a WHATWG label (GIAS and Ofsted use 'windows-1252'). The output file uses the same one. */
  encoding?: string;
}


/**
 * Bytes for each character that windows-1252 has and latin1 doesn't (0x80 to 0x9f). Each byte is decoded after an ASCII
 * one and in streaming mode, because Node's decoder takes a shortcut for a lone byte and returns latin1 (0x92 comes
 * back as U+0092 rather than a right single quote).
 */
function windows1252Bytes(): Map<string, number> {
  const map = new Map<string, number>();
  for (let b = 0x80; b < 0xa0; b++) map.set(new TextDecoder('windows-1252').decode(Uint8Array.of(0x41, b), { stream: true })[1], b);
  return map;
}
const W1252 = windows1252Bytes();

/** Text to bytes in the file's own encoding, so a filtered file reads back exactly like the original. */
export function encoder(encoding: string): (text: string) => Buffer {
  const label = encoding.toLowerCase();
  if (label === 'utf-8' || label === 'utf8') return (text) => Buffer.from(text, 'utf-8');
  if (label === 'windows-1252') {
    return (text) => {
      const out = Buffer.alloc(text.length);
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const code = text.charCodeAt(i);
        const b = W1252.get(c) ?? (code < 0x100 ? code : 0x3f);
        out[i] = b;
      }
      return out;
    };
  }
  throw new Error(`Cannot write ${encoding}`);
}

/**
 * Streams the CSV at `url`, keeps the rows `keep` accepts (and the newest year, if asked) and the listed `columns`, and writes
 * them to `file` (via a .part file). Returns the number of rows written. Throws on an HTTP error (an HttpError, so a caller
 * with several candidate URLs can try the next) or if nothing is left.
 */
export async function downloadFilteredCsv(url: string, file: string, options: FilteredCsvOptions): Promise<number> {
  const { columns, keep, latestPeriod, encoding = 'utf-8' } = options;
  if (latestPeriod && !columns.includes('time_period')) throw new Error('latestPeriod needs time_period in columns');
  const { stream, abort } = await openUrl(url);
  const decoder = new TextDecoder(encoding);
  const decode = new Transform({
    transform(chunk: Buffer, _enc, done) {
      done(null, decoder.decode(chunk, { stream: true }));
    },
    flush(done) {
      done(null, decoder.decode());
    },
  });
  const parser = parse({ columns: true, bom: true, relax_column_count: true });
  stream.on('error', (e) => parser.destroy(e)).pipe(decode).pipe(parser);

  const header = columns.map(csvCell).join(',');
  let lines: string[] = [];
  let period = '';
  let checked = false;
  let stopped = false;
  try {
    for await (const r of parser as AsyncIterable<Row>) {
      if (!checked) {
        const missing = columns.filter((c) => !(c in r));
        if (missing.length) throw new Error(`${url} has no column ${missing.join(', ')}`);
        checked = true;
      }
      if (latestPeriod === 'newest-first') {
        // The first row of the file is a newest-year row (kept or not)
        const t = r.time_period;
        if (!period) period = t;
        if (t > period) throw new Error(`${url} is not newest-first (${t} after ${period})`);
        if (t < period) {
          stopped = true;
          abort();
          break;
        }
      }
      if (keep && !keep(r)) continue;
      if (latestPeriod === 'any') {
        const t = r.time_period;
        if (t < period) continue;
        if (t > period) {
          period = t;
          lines = [];
        }
      }
      lines.push(columns.map((c) => csvCell(r[c] ?? '')).join(','));
    }
  } catch (e) {
    if (!stopped) throw e;
  }
  if (lines.length === 0) throw new Error(`No rows to keep in ${url}`);

  const encode = encoder(encoding);
  const tmp = `${file}.part`;
  const out = createWriteStream(tmp);
  out.write(encode(header + '\n'));
  for (let i = 0; i < lines.length; i += 5000) out.write(encode(lines.slice(i, i + 5000).join('\n') + '\n'));
  out.end();
  await once(out, 'finish');
  await rename(tmp, file);
  return lines.length;
}
