import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { MIN_DISADVANTAGED_PUPILS } from './constants.ts';
import { loadDisadvantage } from './parse.ts';

// The KS4 file belongs to ks4-headline, so that is where its fixture lives
const fixture = new URL('../ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('disadvantage parser: both groups by year, suppression becomes null', async () => {
  const d = await loadDisadvantage(fixture);
  assert.deepEqual(d.get(100049)!.get('2024/25'), {
    disadvantagedCount: 117,
    disadvantagedAtt8: 39.8,
    notDisadvantagedCount: 29,
    notDisadvantagedAtt8: 48.8,
  });
  // Independent school: every value "z"
  assert.deepEqual(d.get(100001)!.get('2024/25'), { disadvantagedCount: null, disadvantagedAtt8: null, notDisadvantagedCount: null, notDisadvantagedAtt8: null });
  assert.equal(d.get(109694)!.get('2024/25')!.notDisadvantagedCount, 0);
});

test('ks4-disadvantaged: a known school', async () => {
  const { rows } = await buildFromFixtures('ks4-disadvantaged');
  const r = rows('ks4-disadvantaged').get(100049);
  assert.ok(r);
  assert.equal(r.disadvantagedYear, '2024/25');
  assert.equal(r.disadvantagedCount, 117);
  assert.equal(r.att8NotDisadvantaged, 48.8);
  assert.equal(r.disadvantageGap, -9); // 39.8 - 48.8, from the source rows
  assert.ok(typeof r.att8DisadvantagedPct === 'number');
});

test('ks4-disadvantaged: same year and values as the headline fields', async () => {
  const { rows } = await buildFromFixtures('ks4-disadvantaged');
  const head = rows('ks4-headline');
  for (const [urn, r] of rows('ks4-disadvantaged')) {
    assert.equal(r.disadvantagedYear, head.get(urn)!.ks4Year, `${urn} year`);
    if (r.disadvantageGap !== null) {
      const expected = (head.get(urn)!.att8Disadvantaged as number) - (r.att8NotDisadvantaged as number);
      assert.ok(Math.abs((r.disadvantageGap as number) - expected) < 0.06, `${urn} gap`);
    }
  }
});

test('ks4-disadvantaged: small cohorts are not ranked, suppressed schools have no row', async () => {
  const { rows } = await buildFromFixtures('ks4-disadvantaged');
  const all = rows('ks4-disadvantaged');
  for (const [urn, r] of all) {
    if (r.att8DisadvantagedPct !== null) assert.ok((r.disadvantagedCount as number) >= MIN_DISADVANTAGED_PUPILS, `${urn}`);
    if (r.disadvantageGap !== null) assert.ok((r.disadvantagedCount as number) >= MIN_DISADVANTAGED_PUPILS, `${urn}`);
  }
  assert.equal(all.has(100001), false); // independent school, every value "z"
});

test('ks4-disadvantaged: percentiles are in range and the gap needs both groups', async () => {
  const { rows } = await buildFromFixtures('ks4-disadvantaged');
  for (const [urn, r] of rows('ks4-disadvantaged')) {
    const pct = r.att8DisadvantagedPct as number | null;
    assert.ok(pct === null || (pct >= 0 && pct <= 100), `${urn}: ${String(pct)}`);
    if (r.att8NotDisadvantaged === null) assert.equal(r.disadvantageGap, null, `${urn}`);
  }
});
