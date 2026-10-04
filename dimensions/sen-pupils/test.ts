import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { loadSenPupils } from './parse.ts';
import { popupSections } from './web.ts';

const fixture = new URL('./fixtures/sen-school.csv', import.meta.url).pathname;

test('sen parser: counts become percentages of all pupils, to one decimal', async () => {
  const s = await loadSenPupils(fixture);
  assert.deepEqual(s.get(100049), { year: '2025/26', pupils: 878, ehcpPct: 3.4, supportPct: 22.8 });
  assert.equal(s.get(100052)!.ehcpPct, 0); // zero is a real value
});

test('sen parser: a school with no pupils gets no row, and a scientific-notation URN is read', async () => {
  const s = await loadSenPupils(fixture);
  assert.equal(s.has(900003), false);
  assert.equal(s.get(100000)!.pupils, 229); // "1.00E+05"
});

test('sen-pupils: values and medians, in both phases', async () => {
  for (const phase of ['secondary', 'primary'] as const) {
    const { rows, metadata } = await buildFromFixtures('sen-pupils', phase);
    const all = rows('sen-pupils');
    assert.ok(all.size > 0);
    for (const [urn, row] of all) {
      for (const k of ['senEhcpPct', 'senSupportPct'] as const) {
        const v = row[k] as number;
        assert.ok(v >= 0 && v <= 100, `${urn} ${k}: ${String(v)}`);
      }
    }
    assert.equal(metadata.senYear, '2025/26');
    assert.equal(typeof metadata.senMedianEhcpPct, 'number');
  }
  const primary = (await buildFromFixtures('sen-pupils', 'primary')).rows('sen-pupils');
  assert.deepEqual(primary.get(900001), { senYear: '2025/26', senEhcpPct: 5.7, senSupportPct: 17.5 });
});

const school = (p: Partial<School>) => ({ senYear: null, senEhcpPct: null, senSupportPct: null, ...p }) as School;

test('popup: shows school and typical figures, keeps real zeros, and is hidden without data', () => {
  const s = popupSections[0];
  const meta = { senMedianEhcpPct: 3.1, senMedianSupportPct: 14.2 } as unknown as Metadata;
  const title = typeof s.title === 'function' ? s.title(school({ senYear: '2025/26' })) : s.title;
  assert.equal(title, 'Special educational needs (January 2026 census)');
  const out = String(s.render(school({ senEhcpPct: 0, senSupportPct: 17.5 }), h, () => [], meta));
  assert.match(out, /17\.5%/);
  assert.match(out, /14\.2%/);
  assert.match(out, /0\.0%/);
  assert.doesNotMatch(out, /null|NaN/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
});
