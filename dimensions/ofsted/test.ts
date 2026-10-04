import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { OFSTED_SUMMARIES } from './grades.ts';
import { loadOfsted } from './parse.ts';

const fixture = new URL('./fixtures/ofsted.csv', import.meta.url).pathname;

test('ofsted parser: one school per framework', async () => {
  const ofsted = await loadOfsted(fixture);
  const card = ofsted.get(100055)!; // report card (renewed framework)
  assert.equal(card.framework, 'report-card');
  assert.equal(card.date, '2026-05-13');
  assert.equal(card.rc.curriculum, 'Needs attention');
  assert.equal(card.rc.safeguarding, 'Met');
  assert.equal(card.summary, 'concern');

  const oeif = ofsted.get(100050)!; // older graded inspection
  assert.equal(oeif.framework, 'oeif');
  assert.equal(oeif.oeif.overall, 1);
  assert.equal(oeif.oeif.sixthForm, 2);
  assert.equal(oeif.summary, 'top');

  const ungraded = ofsted.get(100049)!; // short inspection only
  assert.equal(ungraded.framework, 'ungraded');
  assert.equal(ungraded.date, '2025-01-29');
  assert.equal(ungraded.summary, null); // "Standards maintained" does not imply a grade
  assert.equal(ofsted.get(100455)!.summary, 'top'); // "School remains Outstanding" does
});

test('ofsted parser: grades Ofsted did not give become null', async () => {
  const school = (await loadOfsted(fixture)).get(116430)!;
  assert.equal(school.oeif.overall, null); // no overall grade after September 2024
  assert.equal(school.oeif.quality, 3);
  assert.equal(school.oeif.behaviour, 4);
  assert.equal(school.rc.curriculum, null);
  assert.equal(school.summary, 'serious');
});

test('ofsted: a known school with a short inspection', async () => {
  const { rows } = await buildFromFixtures('ofsted');
  const r = rows('ofsted').get(100049);
  assert.ok(r);
  assert.equal(r.ofstedFramework, 'ungraded');
  assert.equal(r.ofstedDate, '2025-01-29');
  assert.equal(r.ungradedOutcome, 'Standards maintained');
  assert.equal(r.ofstedSummary, null);
});

test('ofsted: summaries are one of the four levels, and independent schools have no row', async () => {
  const { rows } = await buildFromFixtures('ofsted');
  const r = rows('ofsted');
  assert.equal(r.has(100001), false); // Ofsted does not cover this independent school
  for (const [urn, row] of r) {
    const s = row.ofstedSummary as string | null;
    assert.ok(s === null || (OFSTED_SUMMARIES as readonly string[]).includes(s), `${urn}: ${String(s)}`);
  }
  assert.equal(r.get(103519)?.ofstedSummary, 'serious');
  assert.equal(r.get(103519)?.rcCurriculum, 'Urgent improvement');
});
