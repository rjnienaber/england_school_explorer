// Regenerates web/generated/*.ts and the README sources table from dimensions/*.
// Usage: node scripts/generate.ts   (build:data, build:web and typecheck run this for you)
import { generateAll } from '../lib/generate.ts';
import { loadBuildOrder } from '../lib/registry.ts';

await generateAll(await loadBuildOrder());
