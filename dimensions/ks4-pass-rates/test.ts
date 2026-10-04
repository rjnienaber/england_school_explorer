import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { loadPassRates } from './parse.ts';

// The KS4 file belongs to ks4-headline, so that is where its fixture lives
const fixture = new URL('../ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('pass rates parser: Total rows by year, and suppression codes become null', async () => {
  const rates = await loadPassRates(fixture);
  assert.deepEqual(rates.get(100049)!.get('2024/25'), { engMaths4: 64.4, fiveGcseEngMaths: 55.5, ebacc4: 17.1, ebacc5: 13.7 });
  assert.equal(rates.get(100049)!.get('2023/24')!.engMaths4, 70.1);
  assert.deepEqual(rates.get(109319)!.get('2024/25'), { engMaths4: null, fiveGcseEngMaths: null, ebacc4: null, ebacc5: null });
});

test('ks4-pass-rates: a school gets the figures for the headline year', async () => {
  const { rows } = await buildFromFixtures('ks4-pass-rates');
  const r = rows('ks4-pass-rates').get(100049);
  assert.ok(r);
  assert.equal(r.passRatesYear, '2024/25');
  assert.equal(r.engMaths4, 64.4);
  assert.equal(r.fiveGcseEngMaths, 55.5);
  assert.equal(r.ebacc4, 17.1);
  assert.equal(r.ebacc5, 13.7);
});

test('ks4-pass-rates: suppressed and missing rows have no row; invariants hold', async () => {
  const { rows } = await buildFromFixtures('ks4-pass-rates');
  const all = rows('ks4-pass-rates');
  assert.equal(all.has(109319), false); // every figure suppressed
  assert.equal(all.has(100050), false); // no figures in the file
  for (const [urn, r] of all) {
    // The grade 4+ rate can't be lower than the grade 5+ rate, and 5 GCSEs can't beat English and maths
    const [em4, five] = [r.engMaths4 as number | null, r.fiveGcseEngMaths as number | null];
    if (em4 !== null && five !== null) assert.ok(five <= em4, `${urn}: ${five} > ${em4}`);
    const [e4, e5] = [r.ebacc4 as number | null, r.ebacc5 as number | null];
    if (e4 !== null && e5 !== null) assert.ok(e5 <= e4, `${urn}: ebacc ${e5} > ${e4}`);
  }
});
