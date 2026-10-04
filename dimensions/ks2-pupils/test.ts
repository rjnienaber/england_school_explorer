import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School } from '../../web/toolkit.ts';
import { popupSections } from './web.ts';

test('ks2-pupils: shares as published for the Year 6 group, suppressed values are null', async () => {
  const { rows, metadata } = await buildFromFixtures('ks2-pupils');
  const all = rows('ks2-pupils');
  assert.deepEqual(all.get(900001), { ks2PupilsYear: '2024/25', ks2DisadvantagedPct: 17, ks2SenSupportPct: 27, ks2EhcpPct: 3, ks2EalPct: 70 });
  const r = all.get(900003)!;
  assert.equal(r.ks2DisadvantagedPct, 42);
  assert.equal(r.ks2SenSupportPct, null); // "z"
  assert.equal(r.ks2EhcpPct, 0); // zero is a real value, not missing
  assert.equal(all.has(900007), false); // everything suppressed: no row
  assert.equal(all.has(900002), false);
  assert.equal(metadata.ks2PupilsYear, '2024/25');
  assert.equal(typeof metadata.ks2PupilsMedianDisadvantagedPct, 'number');
});

const school = (p: Partial<School>) => ({ ks2PupilsYear: null, ks2DisadvantagedPct: null, ks2SenSupportPct: null, ks2EhcpPct: null, ks2EalPct: null, ...p }) as School;

test('popup: hides missing rows, keeps real zeros, and is hidden without data', () => {
  const s = popupSections[0];
  const meta = { ks2PupilsMedianDisadvantagedPct: 24, ks2PupilsMedianEhcpPct: 2 } as unknown as Metadata;
  assert.equal(s.render(school({}), h, () => [], meta), null);
  const out = s.render(school({ ks2DisadvantagedPct: 17, ks2EhcpPct: 0 }), h, () => [], meta)!.toString();
  assert.match(out, /Disadvantaged/);
  assert.match(out, /17%/);
  assert.match(out, /Education, health and care plan/);
  assert.doesNotMatch(out, /SEN support/);
  assert.doesNotMatch(out, /null|NaN/);
});
