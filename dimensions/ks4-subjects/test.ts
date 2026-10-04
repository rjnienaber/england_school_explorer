import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type Metadata, type School, type SelectFilter } from '../../web/toolkit.ts';
import { loadSubjects } from './parse.ts';
import { decodeEntries, encodeEntries, SUBJECTS } from './subjects.ts';
import { filters, popupSections } from './web.ts';

const fixture = new URL('./fixtures/ks4-subjects.csv', import.meta.url).pathname;

test('subjects parser: entries as a share of the year group, from the source rows', async () => {
  const s = await loadSubjects(fixture);
  // Haverstock: 35 Spanish entries of 146 pupils = 24%, 23 computer science = 16%, 1 Italian = 0.7% -> shown as 1%
  const h49 = s.get(100049)!;
  assert.equal(h49.year, '2024/25');
  assert.equal(h49.entries.get('SPA'), 24);
  assert.equal(h49.entries.get('CS'), 16);
  assert.equal(h49.entries.get('ITA'), 1);
  assert.equal(h49.entries.get('FRE'), 1);
  assert.equal(h49.entries.has('GER'), false);
  // Geography is not a headline subject
  assert.equal([...h49.entries.keys()].includes('GEO'), false);
});

test('subjects parser: suppressed values are skipped, shares stop at 100, further maths is the Level 3 qualification', async () => {
  const s = await loadSubjects(fixture);
  // 100055: a "c" Spanish count and a "z" French count are skipped; 125 computer science entries for 120 pupils stop at 100%
  assert.deepEqual([...s.get(100055)!.entries], [['CS', 100]]);
  assert.equal(s.get(100455)!.entries.get('FM'), 20); // 36 of 183 pupils
  assert.equal(s.get(109694), undefined); // no row at all
});

test('subjects: stored rows, the filter codes and the typical figures', async () => {
  const { rows, metadata } = await buildFromFixtures('ks4-subjects');
  const all = rows('ks4-subjects');
  const r = all.get(100001)!;
  assert.equal(r.subjectsYear, '2024/25');
  assert.equal(r.subjectEntries, 'FRE:33,GER:14,LAT:22,ITA:3,CS:25');
  assert.equal(r.subjectsOffered, 'LANG,FRE,GER,LAT,ITA,CS');
  assert.equal(all.get(100049)!.subjectsOffered, 'LANG,FRE,SPA,ITA,CS,MUS');
  assert.equal(all.has(109694), false);
  assert.equal(metadata.subjectsYear, '2024/25');
  const typical = metadata.subjectsTypicalPct as Record<string, number>;
  assert.ok(typical.SPA > 0 && typical.SPA <= 100);
  for (const [urn, row] of all) {
    const e = decodeEntries(row.subjectEntries as string);
    assert.ok(e.size > 0, String(urn));
    for (const v of e.values()) assert.ok(v >= 1 && v <= 100, `${urn}: ${v}`);
  }
});

test('subjects: codes round-trip and are unique', () => {
  assert.equal(new Set(SUBJECTS.map((s) => s.code)).size, SUBJECTS.length);
  assert.equal(new Set(SUBJECTS.map((s) => s.group)).size, SUBJECTS.length);
  const m = new Map([['SPA', 24], ['CS', 16]]);
  assert.equal(encodeEntries(m), 'SPA:24,CS:16');
  assert.deepEqual([...decodeEntries('SPA:24,XXX:5,CS:16')], [['SPA', 24], ['CS', 16]]);
  assert.equal(decodeEntries(null).size, 0);
});

const school = (p: Partial<School>) => ({ subjectsYear: null, subjectEntries: null, subjectsOffered: null, ...p }) as School;

test('filter: keeps schools offering the subject and hides those with no figures', () => {
  const f = filters[0] as SelectFilter;
  assert.equal(f.test(school({}), ''), true);
  assert.equal(f.test(school({ subjectsOffered: 'LANG,FRE' }), 'FRE'), true);
  assert.equal(f.test(school({ subjectsOffered: 'LANG,FRE' }), 'LAT'), false);
  assert.equal(f.test(school({}), 'FRE'), false);
});

test('popup: chips, shares against typical, and hidden without data', () => {
  const s = popupSections[0];
  const meta = { subjectsTypicalPct: { SPA: 30 }, subjectsOfferedByPct: { SPA: 70 } } as unknown as Metadata;
  const html = String(s.render(school({ subjectsYear: '2024/25', subjectEntries: 'SPA:24,CS:16' }), h, () => [], meta));
  assert.match(html, /<span class="tag">Spanish<\/span>/);
  assert.match(html, /24%/);
  assert.match(html, /30%/);
  assert.match(html, /70%/);
  assert.match(html, /Not entered: .*music/);
  assert.equal(s.render(school({}), h, () => [], meta), null);
  const evil = String(s.render(school({ subjectEntries: 'SPA:24<img>' }), h, () => [], meta));
  assert.doesNotMatch(evil, /<img>/);
});
