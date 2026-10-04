import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { DEFAULT_PUPIL_SD, fitModels, scoreSchool, type Inputs } from './model.ts';

// A made-up set of schools whose Attainment 8 follows the factors exactly, plus a fixed wobble
function synthetic(count: number, withPrior = true): Inputs[] {
  return Array.from({ length: count }, (_, k) => {
    const disadvantagedPct = (k * 7) % 60;
    const ealPct = (k * 13) % 40;
    const priorLowPct = 10 + ((k * 5) % 30);
    const priorHighPct = 20 + ((k * 11) % 40);
    const gender = k % 10 === 0 ? 'Girls' : k % 17 === 0 ? 'Boys' : 'Mixed';
    const wobble = (k % 5) - 2;
    const att8 = 45 - 0.2 * disadvantagedPct + 0.1 * ealPct - 0.15 * priorLowPct + 0.4 * priorHighPct + (gender === 'Girls' ? 3 : 0) + wobble;
    return { urn: k, att8, cohort: 100, disadvantagedPct, ealPct, priorLowPct: withPrior ? priorLowPct : null, priorHighPct: withPrior ? priorHighPct : null, gender };
  });
}

test('model: fits every model it has the schools for, richest first, and R² rises with the factors', () => {
  const models = fitModels(synthetic(200));
  assert.deepEqual(models.map((m) => m.id), ['full', 'no-prior', 'basic']);
  const [full, noPrior, basic] = models;
  assert.ok(full.fit.r2 > 0.95, `full R² ${full.fit.r2}`);
  assert.ok(full.fit.r2 > noPrior.fit.r2 && noPrior.fit.r2 > basic.fit.r2);
  assert.equal(full.baselineR2, basic.fit.r2); // same schools, so the baseline matches the basic model
  assert.ok(Math.abs(full.fit.coefficients[3] - 0.4) < 0.05); // high prior attainers
});

test('model: a school missing an input falls back to the richer model it can still use', () => {
  const schools = synthetic(200);
  const models = fitModels(schools);
  const base = schools[3];
  assert.equal(scoreSchool(models, base, 14.5)?.model, 'full');
  assert.equal(scoreSchool(models, { ...base, priorLowPct: null }, 14.5)?.model, 'no-prior');
  assert.equal(scoreSchool(models, { ...base, priorLowPct: null, ealPct: null }, 14.5)?.model, 'basic');
  assert.equal(scoreSchool(models, { ...base, priorLowPct: null, ealPct: null, disadvantagedPct: null }, 14.5), null);
  // Without any prior attainment in the data, only the models that do not need it are fitted
  assert.deepEqual(fitModels(synthetic(200, false)).map((m) => m.id), ['no-prior', 'basic']);
  // Too few schools: nothing is fitted
  assert.deepEqual(fitModels(synthetic(4)), []);
});

test('model: the standard error combines chance variation (shrinking with cohort size) and the line\'s own uncertainty', () => {
  const models = fitModels(synthetic(200));
  const school = synthetic(200)[3];
  const small = scoreSchool(models, { ...school, cohort: 25 }, 14.5)!;
  const large = scoreSchool(models, { ...school, cohort: 400 }, 14.5)!;
  assert.ok(small.se > large.se);
  assert.ok(Math.abs(small.se ** 2 - (14.5 ** 2 / 25 + models[0].fit.rse ** 2 * models[0].fit.leverage([school.disadvantagedPct!, school.ealPct!, school.priorLowPct!, school.priorHighPct!, 0, 0]))) < 1e-9);
  // An unusual school has a less certain expected score than a typical one
  const odd = scoreSchool(models, { ...school, disadvantagedPct: 400, cohort: 100 }, 14.5)!;
  assert.ok(odd.se > scoreSchool(models, school, 14.5)!.se);
  assert.equal(DEFAULT_PUPIL_SD, 14.5);
});

test('intake-model: results are measured against a fit through non-selective state schools', async () => {
  const { rows } = await buildFromFixtures('intake-model');
  const gias = rows('gias-core');
  const ks4 = rows('ks4-headline');
  const mine = rows('intake-model');

  const state = [...ks4].filter(([urn, k]) => gias.get(urn)?.sector === 'state' && k.ks4Year === '2024/25' && k.att8 !== null && k.disadvantagedPct !== null);
  assert.ok(state.length >= 8, 'the fixture needs enough schools for a fit');
  assert.equal(mine.size, state.length);
  for (const [urn] of state) {
    const row = mine.get(urn)!;
    assert.ok(typeof row.att8VsIntake === 'number');
    assert.ok((row.att8VsIntakeSe as number) > 0.5 && (row.att8VsIntakeSe as number) < 20, `${urn} se ${String(row.att8VsIntakeSe)}`);
    assert.ok(['full', 'no-prior', 'basic'].includes(row.att8IntakeModel as string));
  }
});

test('intake-model: a grammar school beats its expected score; schools without data or independent ones get no row', async () => {
  const { rows, metadata } = await buildFromFixtures('intake-model');
  const mine = rows('intake-model');
  assert.ok((mine.get(101361)?.att8VsIntake as number) > 5);
  assert.equal(mine.has(100001), false); // independent
  assert.equal(mine.has(109694), false); // every result suppressed
  for (const [urn, row] of mine) {
    const pct = row.att8VsIntakePct as number | null;
    assert.ok(pct !== null && pct >= 0 && pct <= 100, `${urn} percentile ${String(pct)}`);
  }
  const summary = metadata.intakeModel as { year: string; pupilSd: number; models: { id: string; r2: number }[] };
  assert.equal(summary.year, '2024/25');
  assert.ok(summary.pupilSd > 5 && summary.pupilSd < 30);
  assert.ok(summary.models.length >= 1);
});
