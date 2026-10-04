// A small reader for .xlsx workbooks (no dependency): enough to pull the rows of one sheet out of a DfE download.
// An .xlsx is a zip of XML files. We read the zip's index, inflate the few parts we need and walk the cells with
// regular expressions, which is fine for the plain data sheets the DfE publishes (no formulas, no styles needed).
import { inflateRawSync } from 'node:zlib';

/** Contents of every file in a zip held in memory (stored or deflated entries; no zip64, no encryption). */
export function unzip(zip: Buffer): Map<string, Buffer> {
  // The end-of-central-directory record is within the last 64 KB
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf-8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataStart, dataStart + size);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()] as string;
  });

/** Text of a shared-string or inline-string element: the concatenated <t> parts (rich text has several). */
const textOf = (xml: string) => decodeXml([...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join(''));

/** One row: column letters ("A", "BC") to the cell's text (numbers as written, e.g. "1231961"). Empty cells are left out. */
export type XlsxRow = Record<string, string>;

/**
 * The rows of the sheet called `sheetName`, as column letter to text. Rows are yielded in file order.
 * Throws if there is no such sheet.
 */
export function* readXlsxSheet(files: Map<string, Buffer>, sheetName: string): Generator<XlsxRow> {
  const get = (path: string) => {
    const f = files.get(path);
    if (!f) throw new Error(`Workbook has no ${path}`);
    return f.toString('utf-8');
  };
  const workbook = get('xl/workbook.xml');
  const sheet = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((tag) => decodeXml(/name="([^"]*)"/.exec(tag)?.[1] ?? '') === sheetName);
  if (!sheet) throw new Error(`Workbook has no sheet "${sheetName}"`);
  const rid = /r:id="([^"]*)"/.exec(sheet)?.[1];
  const rels = get('xl/_rels/workbook.xml.rels');
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((tag) => /\bId="([^"]*)"/.exec(tag)?.[1] === rid);
  const target = /Target="([^"]*)"/.exec(rel ?? '')?.[1];
  if (!target) throw new Error(`No file for sheet "${sheetName}"`);
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;

  const strings = files.has('xl/sharedStrings.xml') ? [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const xml = get(path);
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (let r = rowRe.exec(xml); r; r = rowRe.exec(xml)) {
    const row: XlsxRow = {};
    cellRe.lastIndex = 0;
    const body = r[1];
    for (let c = cellRe.exec(body); c; c = cellRe.exec(body)) {
      const inner = c[3] ?? '';
      let value: string;
      if (/\bt="inlineStr"/.test(c[2])) value = textOf(inner);
      else {
        const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
        if (v === undefined) continue;
        value = /\bt="s"/.test(c[2]) ? (strings[Number(v)] ?? '') : decodeXml(v);
      }
      if (value !== '') row[c[1]] = value;
    }
    yield row;
  }
}
