import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type ChipFilter, type School } from '../../web/toolkit.ts';
import { findSimilar, type Candidate } from './model.ts';
import { parseSimilar, rankAmong, similarFocusValue } from './shared.ts';
import { filters, popupSections } from './web.ts';

const c = (urn: number, o: Partial<Candidate> = {}): Candidate => ({
  urn, selective: false, gender: 'Mixed', disadvantagedPct: 20, ealPct: 10, priorLowPct: 15, priorHighPct: 20, pupils: 1000, rural: false, ...o,
});

test('findSimilar: nearest first, never itself, and by the standardised numbers', () => {
  // Disadvantaged % spreads 10 to 40; everything else is equal, so the order is by that gap
  const schools = [c(1, { disadvantagedPct: 10 }), c(2, { disadvantagedPct: 14 }), c(3, { disadvantagedPct: 25 }), c(4, { disadvantagedPct: 40 })];
  const near = findSimilar(schools, 2);
  assert.deepEqual(near.get(1), [2, 3]);
  assert.deepEqual(near.get(3), [2, 1]); // 11 away from 2 and 15 from 1, 15 from 4: ties go to the lower URN
  assert.deepEqual(near.get(4), [3, 2]);
  assert.ok([...near].every(([urn, list]) => !list.includes(urn)));
});

test('findSimilar: only the same kind of school, and a smaller kind gives what it has', () => {
  const schools = [
    c(1), c(2), c(3, { disadvantagedPct: 21 }),
    c(10, { selective: true, disadvantagedPct: 20 }), c(11, { selective: true, disadvantagedPct: 5 }),
    c(20, { gender: 'Girls' }), c(21, { gender: 'Girls', disadvantagedPct: 40 }), c(22, { gender: 'Boys' }),
  ];
  const near = findSimilar(schools, 5);
  assert.deepEqual(near.get(1)?.sort(), [2, 3]); // not the selective, girls or boys schools
  assert.deepEqual(near.get(10), [11]);
  assert.deepEqual(near.get(20), [21]);
  assert.deepEqual(near.get(22), []); // the only boys' school
});

test('findSimilar: a rural school prefers rural neighbours, all else equal', () => {
  const schools = [c(1, { rural: true }), c(2, { rural: false }), c(3, { rural: true }), c(4, { disadvantagedPct: 20.5 })];
  assert.equal(findSimilar(schools, 1).get(1)?.[0], 3);
});

test('rankAmong: ties share the better place; missing values are skipped', () => {
  assert.deepEqual(rankAmong(50, [60, 50, 40, null, undefined], true), { rank: 2, of: 4 });
  assert.deepEqual(rankAmong(5, [4, 5, 6], false), { rank: 2, of: 4 });
  assert.deepEqual(rankAmong(5, [], true), { rank: 1, of: 1 });
});

test('similar urns: stored list and focus value round trip, junk ignored', () => {
  assert.deepEqual(parseSimilar('3-4-5'), [3, 4, 5]);
  assert.deepEqual(parseSimilar(null), []);
  assert.deepEqual(parseSimilar('x-3--0-4.5'), [3]);
  assert.equal(similarFocusValue(9, '3-4'), '9-3-4');
});

test('similar-schools build: independent schools and schools missing figures are left out', async () => {
  const { rows } = await buildFromFixtures('similar-schools');
  const all = rows('similar-schools');
  assert.equal(all.has(100001), false); // independent
  for (const [urn, r] of all) {
    const list = parseSimilar(r.similarUrns as string);
    assert.ok(!list.includes(urn));
    for (const other of list) assert.ok(all.has(other), `${urn} lists ${other}, who has no group of their own`);
    const rank = r.similarAtt8Rank as number | null;
    const of = r.similarAtt8Of as number | null;
    assert.ok(rank === null || (rank >= 1 && rank <= of!), `${urn}: ${String(rank)} of ${String(of)}`);
  }
});

const school = (o: Partial<School>) =>
  ({ urn: 0, name: '', att8: null, absencePersistentPct: null, similarUrns: null, similarAtt8Rank: null, similarAtt8Of: null, similarAbsenceRank: null, similarAbsenceOf: null, ...o }) as School;

test('filter: keeps the school and its similar schools, and everything when off', () => {
  const f = filters[0] as ChipFilter;
  assert.equal(f.test(school({ urn: 5 }), '5-6-7'), true);
  assert.equal(f.test(school({ urn: 7 }), '5-6-7'), true);
  assert.equal(f.test(school({ urn: 8 }), '5-6-7'), false);
  assert.equal(f.test(school({ urn: 8 }), ''), true);
  assert.equal(f.test(school({ urn: 8 }), 'junk'), false);
});

test('summary: this school against the median of the others, with places', () => {
  const f = filters[0] as ChipFilter;
  const schools = [
    school({ urn: 5, name: 'Focus', att8: 50, absencePersistentPct: 20 }),
    school({ urn: 6, att8: 60, absencePersistentPct: 15 }),
    school({ urn: 7, att8: 40, absencePersistentPct: 25 }),
    school({ urn: 8, att8: null }),
  ];
  assert.equal(f.control.chipText(schools, '5-6-7-8'), 'Focus');
  const html = f.control.summary!(schools, '5-6-7-8', h)!.value;
  assert.match(html, /Attainment 8: place<\/th><td>2nd of 3</);
  assert.match(html, /median of the others<\/th><td>50\.0</);
  assert.match(html, /Persistent absence: place \(lowest first\)<\/th><td>2nd of 3</);
  assert.match(html, /our own grouping/);
  assert.equal(f.control.summary!([], '9', h), null);
});

test('popup section: places and a button; nothing without a group', () => {
  const render = popupSections[0].render;
  assert.equal(render(school({}), h, () => []), null);
  const html = render(school({ urn: 5, similarUrns: '6-7', similarAtt8Rank: 4, similarAtt8Of: 21 }), h, () => [])!.value;
  assert.match(html, /4th of 21/);
  assert.match(html, /data-value="5-6-7"/);
  assert.match(html, /See the 2 similar schools/);
  assert.doesNotMatch(html, /Persistent absence/);
});

test('short links: ?similar=<urn> is completed from that school, old long links are kept, and the address gets the short form', async () => {
  const f = filters[0] as ChipFilter;
  const loaded: number[] = [];
  const load = async (urn: number) => {
    loaded.push(urn);
    return urn === 5 ? school({ urn, similarUrns: '6-7' }) : undefined;
  };
  assert.equal(await f.resolve!('5', load), '5-6-7');
  assert.deepEqual(loaded, [5]);
  // An old link already has the full set: nothing is fetched and it is kept as it is
  assert.equal(await f.resolve!('5-6-7', load), '5-6-7');
  assert.equal(await f.resolve!('5-9', load), '5-9');
  assert.deepEqual(loaded, [5]);
  // A school with no similar schools, an unknown school and junk
  assert.equal(await f.resolve!('8', load), '8');
  assert.equal(await f.resolve!('junk', load), 'junk');
  assert.equal(await f.resolve!('05', load), '05');
  assert.equal(f.urlValue!('5-6-7'), '5');
  assert.equal(f.urlValue!('5'), '5');
  // The short value written by the address resolves back to what the popup button sets
  assert.equal(await f.resolve!(f.urlValue!(similarFocusValue(5, '6-7')), load), similarFocusValue(5, '6-7'));
});
