// Bundles the browser app into dist/: app.js (MapLibre + our code), app.css and index.html.
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { generateAll } from '../lib/generate.ts';
import { loadBuildOrder } from '../lib/registry.ts';
import { DIST_DIR, ROOT, WEB_DIR } from '../lib/paths.ts';

const watch = process.argv.includes('--watch');
// --release (used by the GitHub Pages deploy) leaves out sourcemaps
const release = process.argv.includes('--release');

const options: esbuild.BuildOptions = {
  // main.ts imports style.css, so esbuild emits app.css alongside app.js
  entryPoints: { app: join(WEB_DIR, 'main.ts') },
  outdir: DIST_DIR,
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !watch,
  sourcemap: !release,
  logLevel: 'info',
};

// The browser code imports the generated record type and module registry
await generateAll(await loadBuildOrder());
await mkdir(DIST_DIR, { recursive: true });
await copyFile(join(WEB_DIR, 'index.html'), join(DIST_DIR, 'index.html'));

// MapLibre 6 starts its web worker from maplibre-gl-worker.mjs next to the script
// that imported it (import.meta.url, i.e. app.js), and the worker imports the shared chunk.
const maplibreDist = join(ROOT, 'node_modules/maplibre-gl/dist');
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(join(maplibreDist, file), join(DIST_DIR, file));
}

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
