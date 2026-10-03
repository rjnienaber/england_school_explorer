import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DATA_DIR = join(ROOT, 'data');
export const WEB_DIR = join(ROOT, 'web');
export const DIST_DIR = join(ROOT, 'dist');
export const SOURCES_FILE = join(DATA_DIR, 'sources.json');

export const dataPath = (name: string) => join(DATA_DIR, name);
