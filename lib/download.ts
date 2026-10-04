import { createWriteStream } from 'node:fs';
import { rename, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

/** Downloads a URL to a file (via a .part file, so a failed download never leaves a truncated file). False if the server says no. */
export async function download(url: string, file: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok || !res.body) return false;
  const tmp = `${file}.part`;
  await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), createWriteStream(tmp));
  await rename(tmp, file);
  const { size } = await stat(file);
  console.log(`  ${(size / 1e6).toFixed(1)} MB → ${file}`);
  return true;
}
