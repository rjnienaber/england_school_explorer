import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { loadSpending } from './parse.ts';
import { popupSections } from './web.ts';

const fixture = new URL('./fixtures/spending.csv', import.meta.url).pathname;

test('spending parser: whole-year figures, split years added up, partial years and missing figures skipped', async () => {
  const s = await loadSpending(fixture);
  const haverstock = s.get(100049)!;
  assert.equal(haverstock.basis, 'cfr');
  assert.equal(haverstock.year, '2024/25');
  assert.ok(Math.abs(haverstock.spendPerPupil - 12486543 / 909) < 1e-9);
  assert.ok(Math.abs(haverstock.teachingStaffSpendPct! - (5651731 / 12486543) * 100) < 1e-9);
  // An academy that changed trust mid-year has two 6-month returns: they are added together
  const marlowe = s.get(128340)!;
  assert.equal(marlowe.basis, 'aar');
  assert.ok(Math.abs(marlowe.spendPerPupil - (5652000 + 5575000) / 1123) < 1e-9);
  assert.ok(Math.abs(marlowe.teachingStaffSpendPct! - ((3144000 + 3058000) / (5652000 + 5575000)) * 100) < 1e-9);
  assert.equal(s.has(100055), false); // no figures supplied
  assert.equal(s.has(136091), false); // returns cover 11 months
});

test('spending: values on the stored rows', async () => {
  const { rows, metadata } = await buildFromFixtures('spending');
  const all = rows('spending');
  const r = all.get(100049)!;
  assert.equal(r.spendYear, '2024/25');
  assert.equal(r.spendBasis, 'maintained');
  assert.equal(r.spendPerPupil, 13737); // 12,486,543 / 909 pupils
  assert.equal(r.teachingStaffSpendPct, 45.3); // 5,651,731 / 12,486,543
  assert.equal(all.get(135315)?.spendBasis, 'academy');
  assert.equal(all.get(135315)?.spendPerPupil, 11121); // 10,821,000 / 973
  assert.equal(all.has(100001), false); // independent school: no finance return
  for (const [urn, row] of all) {
    const v = row.spendPerPupil as number;
    assert.ok(v > 3000 && v < 100000, `${urn}: ${v}`);
    const t = row.teachingStaffSpendPct as number | null;
    assert.ok(t === null || (t > 0 && t < 100), `${urn}: ${String(t)}`);
  }
  assert.equal(metadata.spendMaintainedYear, '2024/25');
  assert.equal(metadata.spendAcademyYear, '2024/25');
  const m = metadata.spendMedianPerPupilMaintained as number;
  assert.ok(m > 5000 && m < 20000, String(m));
});

const school = (p: Partial<School>) => ({ urn: 100049, spendYear: null, spendBasis: null, spendPerPupil: null, teachingStaffSpendPct: null, ...p }) as School;

test('popup: school against the typical figure of its own kind, a finance tool link, and hidden without data', () => {
  const s = popupSections[0];
  const meta = { spendMedianPerPupilMaintained: 7400, spendMedianPerPupilAcademy: 7100, spendMedianTeachingPctAcademy: 52.1, spendMaintainedYear: '2024/25', spendAcademyYear: '2023/24' } as unknown as Metadata;
  const title = typeof s.title === 'function' ? s.title(school({ spendYear: '2024/25' })) : s.title;
  assert.equal(title, 'Funding (2024/25)');
  const maintained = String(s.render(school({ spendYear: '2024/25', spendBasis: 'maintained', spendPerPupil: 13737, teachingStaffSpendPct: 45.3 }), h, () => [], meta));
  assert.match(maintained, /£13,737/);
  assert.match(maintained, /£7,400/);
  assert.match(maintained, /Typical maintained school/);
  assert.match(maintained, /financial-benchmarking-and-insights-tool\.education\.gov\.uk\/school\/100049/);
  assert.match(maintained, /different years/);
  const academy = String(s.render(school({ spendYear: '2023/24', spendBasis: 'academy', spendPerPupil: 8000, teachingStaffSpendPct: 50 }), h, () => [], meta));
  assert.match(academy, /£7,100/);
  assert.match(academy, /52\.1%/);
  assert.match(academy, /leaves out the share of the trust/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
});

test('spending: primary phase has its own rows and secondary schools are absent', async () => {
  const { rows } = await buildFromFixtures('spending', 'primary');
  const all = rows('spending');
  assert.ok(all.has(900001));
  assert.equal(all.has(100049), false);
});
