// Helper for dimensions/*/test.ts: reads a module's rows from the last build (build/schools.sqlite).
// Tests that need real data skip themselves when there is no store, so `npm test` works on a fresh clone.

import { existsSync } from 'node:fs';
import type { Fields } from './dimension.ts';
import { STORE_FILE } from './paths.ts';
import { openStore, readModuleRows } from './store.ts';

export const hasStore = existsSync(STORE_FILE);
/** Pass as the second argument of `test()`: `test('...', skipWithoutStore, () => {...})`. */
export const skipWithoutStore = { skip: hasStore ? false : 'no build/schools.sqlite (run npm run build:data)' };

/** The rows a module wrote, by URN. Throws when there is no store: call it inside a test that uses skipWithoutStore. */
export function moduleRows(moduleId: string, fields: Fields): Map<number, Record<string, unknown>> {
  const db = openStore();
  if (!db) throw new Error('no build/schools.sqlite');
  try {
    return readModuleRows(db, moduleId, fields);
  } finally {
    db.close();
  }
}
