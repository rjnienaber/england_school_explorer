import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, markdownTable, textTable, type Budgets, type SizedFile } from './check-budgets.ts';

const KB = 1024;
const budgets: Budgets = {
  core: { maxGzipKB: 200 },
  mode: { maxGzipKB: 50 },
  detail: { maxGzipKB: 40 },
  bundle: { files: ['app.js', 'lib.mjs'], baselineGzipKB: 100, maxGrowthPercent: 10 },
};
const file = (path: string, gzipKB: number): SizedFile => ({ path, raw: gzipKB * KB * 4, gzip: gzipKB * KB });
const bundle = (kb: number) => [file('app.js', kb * 0.7), file('lib.mjs', kb * 0.3)];
const manifest = (core: number, mode: number, details: number[]) => ({
  files: [file('core.json', core), file('modes/a.json', mode), ...details.map((d, i) => file(`details/${i}.json`, d))],
});

test('everything within budget passes', () => {
  const { rows, problems } = evaluate(manifest(111, 7, [8, 9]), bundle(105), budgets);
  assert.deepEqual(problems, []);
  assert.deepEqual(rows.map((r) => r.path), ['core.json', 'modes/a.json', 'details/1.json (largest of 2)', 'app.js', 'lib.mjs', 'JS bundle total']);
});

test('a core file over budget fails with a message naming the file and the amount', () => {
  const { problems, rows } = evaluate(manifest(201, 7, [8]), bundle(100), budgets);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /core\.json is 201\.0 KB gzipped, over the core budget of 200 KB \(by 1\.0 KB\)/);
  assert.equal(rows[0].over, true);
});

test('every mode column and every popup shard is checked, not only the largest', () => {
  const m = manifest(100, 51, [41, 45]);
  const { problems } = evaluate(m, bundle(100), budgets);
  assert.equal(problems.length, 3);
  assert.ok(problems.some((p) => p.startsWith('modes/a.json')));
  assert.ok(problems.some((p) => p.startsWith('details/0.json')));
  assert.ok(problems.some((p) => p.startsWith('details/1.json')));
});

test('the bundle may grow 10% over the baseline, not more', () => {
  assert.deepEqual(evaluate(manifest(100, 1, [1]), bundle(110), budgets).problems, []);
  const { problems } = evaluate(manifest(100, 1, [1]), bundle(111), budgets);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /JavaScript bundle.*11\.0% over the 100 KB baseline/);
});

test('the change column compares with the previous manifest, and is n/a for new files', () => {
  const { rows } = evaluate(manifest(120, 7, [8]), bundle(100), budgets, manifest(111, 7, [8]));
  assert.equal(rows[0].delta, 9 * KB);
  assert.equal(rows[1].delta, 0);
  assert.equal(evaluate(manifest(120, 7, [8]), bundle(100), budgets).rows[0].delta, null);
  assert.match(textTable(rows), /\+9\.0 KB/);
});

test('the Markdown summary lists the problems', () => {
  const { rows, problems } = evaluate(manifest(250, 7, [8]), bundle(100), budgets);
  const md = markdownTable(rows, problems);
  assert.match(md, /\*\*1 over budget\*\*/);
  assert.match(md, /\| core\.json \|/);
});
