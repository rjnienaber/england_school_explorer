import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { P8_ELEMENTS, VA_AREAS } from './areas.ts';
import { loadSubjectAreas } from './parse.ts';
import { popupSections } from './web.ts';
import { h } from '../../web/toolkit.ts';
import type { SchoolRecord } from '../../web/generated/fields.ts';

// The KS4 file belongs to ks4-headline, so that is where its fixture lives
const fixture = new URL('../ks4-headline/fixtures/ks4.csv', import.meta.url).pathname;

test('subject areas parser: Total rows by year, suppression codes become null', async () => {
  const s = await loadSubjectAreas(fixture);
  const y = s.get(100049)!.get('2023/24')!;
  assert.deepEqual(y.elements.Eng, { average: -0.03, lower: -0.3, upper: 0.24 });
  assert.deepEqual(y.valueAdded.Hum, { average: -0.14, lower: -0.53, upper: 0.24, pupils: 82 });
  assert.equal(y.valueAdded.Lan.pupils, 48);
  assert.deepEqual(s.get(100001)!.get('2023/24')!.elements.Maths, { average: null, lower: null, upper: null });
});

test('ks4-subject-areas: taken from the Progress 8 year, not the newest year', async () => {
  const { rows } = await buildFromFixtures('ks4-subject-areas');
  const r = rows('ks4-subject-areas').get(100049);
  assert.ok(r);
  assert.equal(r.subjectAreasYear, '2023/24'); // the headline year is 2024/25 but Progress 8 stops at 2023/24
  assert.equal(r.p8Eng, -0.03);
  assert.equal(r.p8EngLower, -0.3);
  assert.equal(r.p8Open, -0.39);
  assert.equal(r.vaHumPupils, 82);
  assert.equal(r.vaLanUpper, 1.31);
});

test('ks4-subject-areas: a school with no published figures gets no row', async () => {
  const { rows } = await buildFromFixtures('ks4-subject-areas');
  assert.equal(rows('ks4-subject-areas').get(100001), undefined);
});

test('subject areas popup: a collapsible block, one chart per element, nothing without data', () => {
  const render = popupSections[0].render;
  const none = new Proxy({}, { get: () => null }) as unknown as SchoolRecord;
  assert.equal(render(none, h, () => []), null);
  // Every field is null unless set, as in the browser
  const names = ['subjectAreasYear', ...P8_ELEMENTS.flatMap((e) => [`p8${e}`, `p8${e}Lower`, `p8${e}Upper`]), ...VA_AREAS.flatMap((a) => [`va${a}`, `va${a}Lower`, `va${a}Upper`])];
  const empty = Object.fromEntries(names.map((n) => [n, null]));
  const p = { ...empty, subjectAreasYear: '2023/24', p8Eng: 0.2, p8EngLower: -0.1, p8EngUpper: 0.5, vaSci: -0.4, vaSciLower: -0.9, vaSciUpper: 0.1 } as unknown as SchoolRecord;
  const html = String(render(p, h, () => [])!.value);
  assert.match(html, /<details/);
  assert.equal((html.match(/<svg/g) ?? []).length, 2); // English and science only
  assert.match(html, /English/);
  assert.match(html, /Science/);
  assert.doesNotMatch(html, /Humanities/);
});
