import { createWriteStream } from 'node:fs';
import { rename, stat } from 'node:fs/promises';
import { request } from 'node:https';
import { pipeline } from 'node:stream/promises';
import { PassThrough, Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

/**
 * Bytes received over the network since the process started, as sent (so gzip-compressed where the server compresses).
 * `npm run fetch` reports it per source and in the run summary. Reading it before and after a download gives that
 * download's size.
 */
let received = 0;
export const bytesDownloaded = () => received;
export const countDownloaded = (bytes: number) => {
  received += bytes;
};

/** The server answered, but not with the file (404 for a day's GIAS extract that is not out yet, for example). */
export class HttpError extends Error {
  status: number;
  constructor(status: number, url: string, detail = '') {
    super(`Download failed (${status}) for ${url}${detail ? `: ${detail}` : ''}`);
    this.status = status;
  }
}

export interface OpenedUrl {
  /** The response body, decompressed. */
  stream: Readable;
  /** Stops the transfer (the rest of the file is never downloaded). */
  abort(): void;
}

/**
 * Opens a URL for reading, following redirects (the EES catalogue redirects to its file store). Uses node:https instead
 * of fetch so that the bytes on the wire can be counted: fetch hides the compression, and the EES files compress to
 * about half. Rejects with an HttpError on a non-200 answer.
 */
export function openUrl(url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}, redirects = 5): Promise<OpenedUrl> {
  return new Promise((resolve, reject) => {
    const headers = { 'accept-encoding': 'gzip, deflate, br', 'user-agent': 'england_school_explorer', ...init.headers };
    const req = request(url, { method: init.method ?? 'GET', headers }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects > 0 && !init.body) {
        res.resume();
        resolve(openUrl(new URL(res.headers.location, url).toString(), init, redirects - 1));
        return;
      }
      if (status !== 200) {
        // Keep the start of the body: an API says what was wrong with the request there
        let detail = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => (detail = (detail + chunk).slice(0, 300)));
        res.on('end', () => reject(new HttpError(status, url, detail)));
        res.on('error', () => reject(new HttpError(status, url, detail)));
        return;
      }
      res.on('data', (chunk: Buffer) => countDownloaded(chunk.length));
      const encoding = res.headers['content-encoding'];
      const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'br' ? createBrotliDecompress() : encoding === 'deflate' ? createInflate() : null;
      // Always pipe: counting with a 'data' listener starts the flow, and an unpiped body would lose its first chunks
      const stream = res.pipe(decoder ?? new PassThrough());
      // Without a listener, aborting would surface as an unhandled error
      res.on('error', () => {});
      resolve({ stream, abort: () => req.destroy() });
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

/** The JSON a URL returns, optionally from a POST with a JSON body. Counted like any other download. Throws an HttpError on a non-200 answer. */
export async function fetchJson(url: string, body?: unknown): Promise<any> {
  const init = body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
  const { stream } = await openUrl(url, init);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

/** Downloads a URL to a file (via a .part file, so a failed download never leaves a truncated file). False if the server says no. */
export async function download(url: string, file: string): Promise<boolean> {
  let opened: OpenedUrl;
  try {
    opened = await openUrl(url);
  } catch (e) {
    if (e instanceof HttpError) return false;
    throw e;
  }
  const tmp = `${file}.part`;
  await pipeline(opened.stream, createWriteStream(tmp));
  await rename(tmp, file);
  const { size } = await stat(file);
  console.log(`  ${(size / 1e6).toFixed(1)} MB → ${file}`);
  return true;
}
