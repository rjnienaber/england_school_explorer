import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DATA_DIR = join(ROOT, 'data');
export const BUILD_DIR = join(ROOT, 'build');
export const WEB_DIR = join(ROOT, 'web');
export const DIST_DIR = join(ROOT, 'dist');
export const DIMENSIONS_DIR = join(ROOT, 'dimensions');
export const GENERATED_DIR = join(WEB_DIR, 'generated');
export const SOURCES_FILE = join(DATA_DIR, 'sources.json');
export const STORE_FILE = join(BUILD_DIR, 'schools.sqlite');

export const dataPath = (name: string) => join(DATA_DIR, name);
