// A small zip writer and reader for the release's all-in-one download (no dependency).
// Entries are deflated with node:zlib (stored when that would not make them smaller). No zip64, so
// it refuses archives over 4 GB, which the release is nowhere near.

import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_NAMES = 0x0800;
const LIMIT = 0xffffffff;

/** MS-DOS date and time fields (local time, two-second resolution, from 1980). */
function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(d.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

/** The bytes of a zip archive holding `entries`, in order. `modified` stamps every entry. */
export function createZip(entries: ZipEntry[], modified: Date = new Date()): Buffer {
  const { date, time } = dosDateTime(modified);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf-8');
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const crc = crc32(data);
    const method = stored ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4); // version needed to extract
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    entry.writeUInt16LE((3 << 8) | 20, 4); // made by: unix, spec 2.0 (so the permissions below are honoured)
    local.copy(entry, 6, 4, 30); // version needed .. name length are the same fields, same order
    entry.writeUInt32LE((0o100644 << 16) >>> 0, 38); // unix permissions (rw-r--r--), so unzip does not make them unreadable
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  if (offset + centralSize > LIMIT || entries.length > 0xffff) throw new Error('zip: archive too large (zip64 is not supported)');
  return Buffer.concat([...parts, ...central, end]);
}

/** Reads an archive made by `createZip` (or any zip without zip64): checks sizes and CRCs, returns the entries. */
export function readZip(zip: Buffer): ZipEntry[] {
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt === -1) throw new Error('zip: no end-of-archive record');
  const count = zip.readUInt16LE(endAt + 10);
  let at = zip.readUInt32LE(endAt + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== CENTRAL_SIGNATURE) throw new Error('zip: bad central directory');
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const packed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf-8', at + 46, at + 46 + nameLength);
    if (zip.readUInt32LE(localAt) !== LOCAL_SIGNATURE) throw new Error(`zip: bad local header for ${name}`);
    const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const body = zip.subarray(dataAt, dataAt + packed);
    const data = method === 0 ? Buffer.from(body) : method === 8 ? inflateRawSync(body) : null;
    if (!data) throw new Error(`zip: ${name} uses unsupported method ${method}`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`zip: ${name} fails its size or CRC check`);
    entries.push({ name, data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
