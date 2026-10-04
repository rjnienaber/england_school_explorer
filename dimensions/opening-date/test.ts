import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type School } from '../../web/toolkit.ts';
import { describeOpening } from './opening.ts';
import { isoDate, loadOpening, openReason } from './parse.ts';
import { popupSections } from './web.ts';

// The GIAS file belongs to gias-core, so that is where its fixture lives
const fixture = new URL('../gias-core/fixtures/gias.csv', import.meta.url).pathname;

test('isoDate: dd-mm-yyyy to ISO, junk to null', () => {
  assert.equal(isoDate('01-09-2023'), '2023-09-01');
  assert.equal(isoDate('31-12-1920'), '1920-12-31');
  for (const bad of [null, '', '2023-09-01', '31-02-2020', '1-9-2023']) assert.equal(isoDate(bad), null);
});

test('openReason: new, academy, other, unknown', () => {
  for (const l of ['New Provision', 'Academy Free School', 'Free Special School', 'New Nursery School']) assert.equal(openReason(l), 'new', l);
  for (const l of ['Academy Converter', 'Academy Sponsor Led', 'Academy Alternative Provision Converter']) assert.equal(openReason(l), 'academy', l);
  for (const l of ['Result of Amalgamation', 'Fresh Start', 'Change Religious Character', 'Split school', 'Former Independent']) assert.equal(openReason(l), 'other', l);
  for (const l of [null, '', 'Not applicable', 'Not Recorded']) assert.equal(openReason(l), null, String(l));
});

test('opening parser: reads the fixture', async () => {
  const found = await loadOpening(fixture);
  assert.deepEqual(found.get(128340), { date: '2005-09-01', reason: 'new' });
  assert.deepEqual(found.get(108058), { date: '1992-09-01', reason: 'other' });
  assert.deepEqual(found.get(100001), { date: '1920-01-01', reason: null });
  assert.equal(found.has(100049), false); // no date, "Not applicable"
});

test('opening-date: values on the stored rows', async () => {
  const { rows } = await buildFromFixtures('opening-date');
  const all = rows('opening-date');
  assert.deepEqual({ ...all.get(135315) }, { openDate: '2007-09-01', openReason: 'new' });
  assert.equal(all.has(100049), false);
});

const now = new Date('2026-10-04T12:00:00Z');

test('describeOpening: recent new school, with and without results', () => {
  assert.deepEqual(describeOpening('2023-09-01', 'new', false, now), { line: 'Opened Sept 2023 (new school)', explainsNoResults: true });
  assert.deepEqual(describeOpening('2023-09-01', 'new', true, now), { line: 'Opened Sept 2023 (new school)', explainsNoResults: false });
});

test('describeOpening: old new schools, other reasons and missing dates say nothing; academies say when', () => {
  assert.equal(describeOpening('2005-09-01', 'new', false, now), null);
  assert.equal(describeOpening('2021-10-01', 'new', false, now)?.line, 'Opened Oct 2021 (new school)'); // exactly 5 years
  assert.equal(describeOpening('2021-09-01', 'new', false, now), null); // just over 5 years
  assert.equal(describeOpening('2024-09-01', 'other', false, now), null);
  assert.equal(describeOpening('2024-09-01', null, false, now), null);
  assert.equal(describeOpening(null, 'new', false, now), null);
  assert.equal(describeOpening('2027-09-01', 'new', false, now), null); // not open yet
  assert.deepEqual(describeOpening('2015-04-01', 'academy', true, now), { line: 'Became an academy in 2015', explainsNoResults: false });
});

test('popup: academy line, nothing for an unremarkable school', () => {
  const s = popupSections[0];
  const school = (openDate: string | null, openReason: string | null) => ({ openDate, openReason, att8: 40 }) as School;
  assert.match(String(s.render(school('2015-04-01', 'academy'), h, () => [])), /Became an academy in 2015/);
  assert.equal(s.render(school(null, null), h, () => []), null);
});
