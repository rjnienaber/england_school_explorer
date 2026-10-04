import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { h, type ChipFilter, type School } from '../../web/toolkit.ts';
import { MEASURES, intervalOf, measureById } from './measures.ts';
import { drawScores, describeBand, rankBand } from './national.ts';
import { MAX_SHORTLIST, parseShortlist, shortlistValue, withSchool } from './shortlist.ts';
import { placeRange, simulateShortlist, type SimMeasure } from './simulate.ts';
import {
  beatenBy, compareReadings, dominates, gradePercentiles, makeNormal, makeRng, normalCdf, percentileIn, probHigher,
  quantileTable, rowVerdict, seFromCi, seOfPercent, verdictOf, weightedMean, type Profile, type Reading,
} from './stats.ts';
import { pairSentence, verdictText } from './wording.ts';
import { extensions, filters, popupSections } from './web.ts';

const near = (actual: number, expected: number, tol = 1e-4) => assert.ok(Math.abs(actual - expected) < tol, `${actual} is not within ${tol} of ${expected}`);

// ---------- The probability ----------

test('normalCdf matches known values', () => {
  near(normalCdf(0), 0.5, 1e-7);
  near(normalCdf(1), 0.8413447, 1e-6);
  near(normalCdf(1.96), 0.9750021, 1e-6);
  near(normalCdf(-1.2815516), 0.1, 1e-6);
  near(normalCdf(-3), 0.0013499, 1e-6);
});

test('seFromCi: a 95% interval is ±1.96 standard errors', () => {
  near(seFromCi(-0.2, 0.2), 0.4 / 3.92, 1e-12);
  near(seFromCi(0.1, 0.5), 0.1020408, 1e-6);
});

test('probHigher: worked cases', () => {
  // Gap 1, spread √(0.6² + 0.8²) = 1: Φ(1)
  near(probHigher(1, 0.6, 0, 0.8), 0.8413447, 1e-6);
  // Same gap the other way round is the complement
  near(probHigher(0, 0.8, 1, 0.6), 1 - 0.8413447, 1e-6);
  // Equal values: a coin toss, however uncertain
  near(probHigher(0.3, 0.2, 0.3, 0.5), 0.5, 1e-9);
  // Progress 8 of +0.20 (CI 0.05 to 0.35) against +0.00 (CI -0.15 to 0.15): z = 0.2 / (0.0765 × √2)
  const z = 0.2 / (seFromCi(0.05, 0.35) * Math.SQRT2);
  near(probHigher(0.2, seFromCi(0.05, 0.35), 0, seFromCi(-0.15, 0.15)), normalCdf(z), 1e-12);
  near(z, 1.848, 1e-3);
  // No uncertainty at all: certain, or a tie
  assert.equal(probHigher(2, 0, 1, 0), 1);
  assert.equal(probHigher(1, 0, 2, 0), 0);
  assert.equal(probHigher(1, 0, 1, 0), 0.5);
});

test('verdictOf: 90% and 10% are the thresholds', () => {
  assert.equal(verdictOf(0.9), 'better');
  assert.equal(verdictOf(0.8999), 'same');
  assert.equal(verdictOf(0.1), 'worse');
  assert.equal(verdictOf(0.1001), 'same');
  assert.equal(verdictOf(0.5), 'same');
  // A gap of 1.2816 standard errors is exactly the 90% line
  assert.equal(verdictOf(probHigher(1.29, 1, 0, 0)), 'better');
  assert.equal(verdictOf(probHigher(1.27, 1, 0, 0)), 'same');
});

test('seOfPercent is the binomial spread in percentage points', () => {
  near(seOfPercent(50, 100)!, 5, 1e-9);
  near(seOfPercent(10, 100)!, 3, 1e-9);
  // A rate of 0% is not known exactly: half a pupil's worth of uncertainty is assumed
  near(seOfPercent(0, 100)!, 100 * Math.sqrt((0.005 * 0.995) / 100), 1e-9);
  assert.equal(seOfPercent(10, 0), null);
  assert.equal(seOfPercent(120, 10), null);
});

test('compareReadings: direction, missing values and grades', () => {
  const a: Reading = { value: 10, se: 1 };
  const b: Reading = { value: 5, se: 1 };
  assert.equal(compareReadings(a, b, true)!.verdict, 'better');
  assert.equal(compareReadings(a, b, false)!.verdict, 'worse'); // lower is better: 10 is worse than 5
  assert.equal(compareReadings(a, null), null);
  const g = compareReadings({ value: 4, se: null }, { value: 3, se: null })!;
  assert.equal(g.prob, null);
  assert.equal(g.verdict, 'better');
  assert.equal(compareReadings({ value: 3, se: null }, { value: 3, se: null })!.verdict, 'same');
});

// ---------- Beaten on every measure ----------

const P = (id: number, ...vals: (number | null)[]): Profile => ({ id, readings: vals.map((v) => (v === null ? null : { value: v, se: 1 })) });
const up = [true, true];

test('dominates: at least as good everywhere and likely better somewhere', () => {
  assert.equal(dominates(P(1, 10, 10), P(2, 5, 5), up), true);
  assert.equal(dominates(P(2, 5, 5), P(1, 10, 10), up), false);
  // Clearly better on one, level on the other
  assert.equal(dominates(P(1, 10, 5), P(2, 5, 5), up), true);
  // Better on one, worse (even slightly) on the other: not dominated
  assert.equal(dominates(P(1, 10, 4.9), P(2, 5, 5), up), false);
});

test('dominates: ties and gaps that could be chance never count as beating', () => {
  // Identical profiles: nobody beats anybody
  assert.equal(dominates(P(1, 5, 5), P(2, 5, 5), up), false);
  assert.equal(dominates(P(2, 5, 5), P(1, 5, 5), up), false);
  // Ahead everywhere but only by a hair: no "likely better" anywhere
  assert.equal(dominates(P(1, 5.1, 5.1), P(2, 5, 5), up), false);
});

test('dominates: a measure either school lacks is skipped, never counted against a school', () => {
  assert.equal(dominates(P(1, 10, null), P(2, 5, 5), up), true);
  assert.equal(dominates(P(1, 10, 10), P(2, 5, null), up), true);
  // Nothing in common: no comparison at all
  assert.equal(dominates(P(1, 10, null), P(2, null, 5), up), false);
  // All missing
  assert.equal(dominates(P(1, null, null), P(2, null, null), up), false);
});

test('dominates: lower-is-better measures flip', () => {
  const dirs = [true, false];
  assert.equal(dominates(P(1, 10, 2), P(2, 5, 5), dirs), true);
  assert.equal(dominates(P(1, 10, 8), P(2, 5, 5), dirs), false);
});

test('dominates: a grade can be matched or beaten but never makes a school likely better', () => {
  const grade = (id: number, v: number, other: number | null): Profile => ({
    id, readings: [{ value: v, se: null }, other === null ? null : { value: other, se: 1 }],
  });
  // Higher grade and equal figure: not enough
  assert.equal(dominates(grade(1, 4, 5), grade(2, 3, 5), up), false);
  // Higher grade plus a clearly better figure
  assert.equal(dominates(grade(1, 4, 9), grade(2, 3, 5), up), true);
  // Lower grade blocks it
  assert.equal(dominates(grade(1, 2, 9), grade(2, 3, 5), up), false);
});

test('beatenBy: names the school that beats each one, or null', () => {
  const ps = [P(1, 10, 10), P(2, 5, 5), P(3, 12, 1)];
  assert.deepEqual(beatenBy(ps, up), [null, 1, null]);
});

test('rowVerdict counts the others a school is likely better or worse than', () => {
  const rs: Reading[] = [{ value: 10, se: 1 }, { value: 5, se: 1 }, { value: 9.5, se: 1 }];
  const v = rowVerdict(rs, 0, true)!;
  assert.deepEqual({ better: v.better, worse: v.worse, same: v.same, others: v.others, best: v.best }, { better: 1, worse: 0, same: 1, others: 2, best: false });
  assert.equal(rowVerdict(rs, 1, true)!.worse, 2);
  assert.equal(rowVerdict([null, rs[0]], 0, true), null);
  assert.equal(rowVerdict([rs[0], null], 0, true)!.others, 0);
});

// ---------- Percentiles, seeds, averages ----------

test('quantileTable and percentileIn', () => {
  const t = quantileTable(Array.from({ length: 101 }, (_, i) => i))!;
  assert.deepEqual([t[0], t[50], t[100]], [0, 50, 100]);
  assert.equal(percentileIn(t, 25), 25);
  assert.equal(percentileIn(t, 25.5), 25.5);
  assert.equal(percentileIn(t, -1), 0);
  assert.equal(percentileIn(t, 101), 100);
  assert.equal(quantileTable([1]), null);
  // A long tie sits in the middle of its stretch: many schools on 0%, then 1 to 10
  const ties = quantileTable([...Array(60).fill(0), ...Array.from({ length: 40 }, (_, i) => i + 1)])!;
  const mid = percentileIn(ties, 0);
  assert.ok(mid > 20 && mid < 40, String(mid));
});

test('makeRng is reproducible and uniform enough; makeNormal has mean 0 and sd 1', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  const c = makeRng(43);
  assert.notDeepEqual(first, [c(), c(), c()]);
  assert.ok(first.every((x) => x >= 0 && x < 1));
  const normal = makeNormal(makeRng(1));
  const xs = Array.from({ length: 20000 }, normal);
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  near(mean, 0, 0.03);
  near(sd, 1, 0.03);
});

test('weightedMean and gradePercentiles', () => {
  assert.equal(weightedMean([{ value: 10, weight: 1 }, { value: 20, weight: 3 }, { value: null, weight: 5 }, { value: 7, weight: null }]), 17.5);
  assert.equal(weightedMean([]), null);
  assert.deepEqual(gradePercentiles({ 1: 20, 2: 50, 3: 30 }), { 1: 10, 2: 45, 3: 85 });
});

// ---------- The simulation, with a fixed seed ----------

const table = Array.from({ length: 101 }, (_, i) => i);
const measure = (weight: number, higherIsBetter = true): SimMeasure => ({ weight, higherIsBetter, table });
const sim = (readings: (number | null)[][], measures: SimMeasure[], draws = 2000, seed = 7) =>
  simulateShortlist(readings.map((r, id) => ({ id, readings: r.map((v) => (v === null ? null : { value: v, se: 5 })) })), measures, draws, seed);

test('simulation: same seed, same answer; a different seed differs a little', () => {
  const rs = [[50, 50], [52, 48], [40, 60]];
  const a = sim(rs, [measure(1), measure(1)]);
  assert.deepEqual(a, sim(rs, [measure(1), measure(1)]));
  assert.notDeepEqual(a.strongest, sim(rs, [measure(1), measure(1)], 2000, 8).strongest);
});

test('simulation: a clearly better school is nearly always strongest, and shares sum to 1', () => {
  const r = sim([[80], [40], [20]], [measure(1)]);
  assert.ok(r.strongest[0]! > 0.99);
  near(r.strongest.reduce((total: number, x) => total + (x ?? 0), 0), 1, 1e-9);
  assert.equal(r.places[2][2] > 1900, true);
  // Every school lands in exactly one place per draw
  for (const p of r.places) assert.equal(p.reduce((s, x) => s + x, 0), 2000);
});

test('simulation: identical schools split the top spot about evenly', () => {
  const r = sim([[50], [50]], [measure(1)], 4000, 11);
  near(r.strongest[0]!, 0.5, 0.04);
});

const EXPECTED = [0.287, 0.289, 0.425];
test('simulation: fixed-seed regression values', () => {
  const r = sim([[60, 50], [55, 55], [50, 62]], [measure(1), measure(1)], 2000, 20260925);
  // Recorded from this seed: any change to the generator or the scoring shows up here
  assert.deepEqual(r.strongest.map((x) => Math.round(x! * 1000) / 1000), EXPECTED);
  assert.ok(r.strongest.every((x) => x! > 0.2 && x! < 0.5));
});

test('simulation: weights decide, and a missing measure is neither a help nor a hurt', () => {
  // School 0 is better on the first measure, school 1 on the second
  const rs = [[70, 30], [30, 70]];
  assert.ok(sim(rs, [measure(9), measure(1)]).strongest[0]! > 0.9);
  assert.ok(sim(rs, [measure(1), measure(9)]).strongest[1]! > 0.9);
  assert.ok(sim(rs, [measure(1), measure(0)]).strongest[0]! > 0.9);
  // School 1 has no second figure: scored on the first alone
  const gap = sim([[70, 70], [30, null]], [measure(1), measure(1)]);
  assert.ok(gap.strongest[0]! > 0.95);
  // A school with nothing on the chosen measures has no chance figure
  assert.equal(sim([[70, null], [30, 30]], [measure(0), measure(1)]).strongest[0], null);
});

test('simulation: lower-is-better measures flip, and a grade does not vary between draws', () => {
  const r = sim([[10], [60]], [measure(1, false)]);
  assert.ok(r.strongest[0]! > 0.99);
  const grade: SimMeasure = { weight: 1, higherIsBetter: true, table: null, gradePercentile: { 3: 40, 4: 90 } };
  const g = simulateShortlist([{ id: 0, readings: [{ value: 4, se: null }] }, { id: 1, readings: [{ value: 3, se: null }] }], [grade], 500, 1);
  assert.deepEqual(g.strongest, [1, 0]);
});

test('placeRange: the shortest run of places holding 80% of draws', () => {
  assert.deepEqual(placeRange([900, 100, 0], 1000), { lo: 1, hi: 1, share: 0.9 });
  assert.deepEqual(placeRange([500, 400, 100], 1000), { lo: 1, hi: 2, share: 0.9 });
  assert.deepEqual(placeRange([300, 300, 400], 1000), { lo: 1, hi: 3, share: 1 });
  assert.deepEqual(placeRange([100, 700, 200], 1000), { lo: 2, hi: 3, share: 0.9 });
});

// ---------- National rank band, with a fixed seed ----------

/** 100 schools on one or two measures; school i scores i on the first and 99 - i on the second. */
function population(withNoise: number) {
  const n = 100;
  const a = Float64Array.from({ length: n }, (_, i) => i);
  const b = Float64Array.from({ length: n }, (_, i) => 99 - i);
  const ses = new Float64Array(n).fill(withNoise);
  const t = quantileTable(Array.from(a))!;
  const mk = (values: Float64Array, w: number): SimMeasure & { values: Float64Array; ses: Float64Array } => ({ weight: w, higherIsBetter: true, table: t, values, ses });
  return { n, mk, a, b };
}

test('rank band: no noise gives a single rank, and it is stable when one measure decides', async () => {
  const { n, mk, a } = population(0);
  const ms = [mk(a, 1)];
  const scores = await drawScores(ms, n, 50, 3);
  const r = rankBand(scores, [1], n, 50, 80)!; // the school scoring 80 of 0-99 is 20th from the top
  assert.deepEqual(r.band, { of: 100, p10: 20, p50: 20, p90: 20 });
  assert.equal(r.stable, true);
  assert.equal(describeBand(r.band), 'roughly top 20%');
});

test('rank band: not stable when the answer turns on the weights', async () => {
  const { n, mk, a, b } = population(0);
  const ms = [mk(a, 2), mk(b, 1)];
  const scores = await drawScores(ms, n, 50, 3);
  const r = rankBand(scores, [2, 1], n, 50, 80)!;
  assert.equal(r.band.p50, 20);
  // Halving the first weight makes every school score the same, so the school drops out of its range
  assert.equal(r.stable, false);
});

test('rank band: uncertainty widens it, and the same seed gives the same band', async () => {
  const { n, mk, a } = population(15);
  const scores = await drawScores([mk(a, 1)], n, 400, 7);
  const r = rankBand(scores, [1], n, 400, 50)!;
  assert.ok(r.band.p90 - r.band.p10 >= 5, JSON.stringify(r.band));
  assert.ok(r.band.p10 < 50 && r.band.p90 > 50);
  assert.deepEqual(r, rankBand(await drawScores([mk(a, 1)], n, 400, 7), [1], n, 400, 50));
  // A school with no value on the measure has no band
  const gap = Float64Array.from(a);
  gap[10] = NaN;
  const g = await drawScores([mk(gap, 1)], n, 20, 7);
  assert.equal(rankBand(g, [1], n, 20, 10), null);
});

test('describeBand rounds to 5% and never reads "top 0%"', () => {
  assert.equal(describeBand({ of: 3300, p10: 500, p50: 800, p90: 990 }), 'roughly top 15–30%');
  assert.equal(describeBand({ of: 3300, p10: 1, p50: 2, p90: 5 }), 'roughly top 5%');
});

// ---------- Shortlist, wording, measures ----------

test('parseShortlist: whole URNs only, no repeats, at most six', () => {
  assert.deepEqual(parseShortlist('100049, 137181,100049,abc,-4,1.5,,2'), [100049, 137181, 2]);
  assert.deepEqual(parseShortlist('1,2,3,4,5,6,7,8'), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parseShortlist(null), []);
  assert.equal(shortlistValue([1, 2]), '1,2');
  assert.deepEqual(withSchool([1, 2], 2), [1, 2]);
  assert.equal(withSchool([1, 2, 3, 4, 5, 6], 7).length, MAX_SHORTLIST);
});

test('wording: "school quality" claims only for intake-adjusted measures', () => {
  for (const m of MEASURES) {
    const text = JSON.stringify(m.words) + m.label;
    if (m.group === 'quality') continue;
    assert.ok(!/progress|than expected|intake/i.test(m.words.better + m.words.worse), `${m.id} says: ${text}`);
  }
  assert.ok(MEASURES.filter((m) => m.group === 'quality').map((m) => m.id).sort().join() === 'intake,p8');
  const att8 = measureById('att8');
  assert.equal(att8.words.better, 'higher results');
  const v = verdictText(measureById('p8'), { better: 1, worse: 0, same: 0, others: 1, best: true })!;
  assert.equal(v.text, 'Likely better progress');
  assert.equal(verdictText(measureById('ofsted'), { better: 1, worse: 0, same: 0, others: 1, best: true })!.text, 'A higher Ofsted grade');
  assert.equal(verdictText(att8, { better: 0, worse: 0, same: 0, others: 0, best: false }), null);
  assert.match(pairSentence(att8, 'A', 'B', 0.95, 'better'), /95%/);
  assert.match(pairSentence(measureById('ofsted'), 'A', 'B', null, 'better'), /no probability/);
});

test('measures read a school record, with a standard error for each figure', () => {
  const s = { p8: 0.2, p8Lower: 0.05, p8Upper: 0.35, ks4Cohort: 100, att8: 50, engMaths5: 40, absencePersistentPct: 20, absencePupils: 400, ofstedSummary: 'good', att8VsIntake: 1.5, att8VsIntakeSe: 0.8 } as unknown as School;
  const p8 = measureById('p8').reading(s)!;
  near(p8.se!, 0.3 / 3.92, 1e-9);
  near(measureById('att8').reading(s, { intakeModel: { pupilSd: 10 } } as never)!.se!, 1, 1e-9);
  near(measureById('engMaths5').reading(s)!.se!, Math.sqrt(0.4 * 0.6 / 100) * 100, 1e-9);
  assert.deepEqual(measureById('ofsted').reading(s), { value: 3, se: null });
  assert.equal(measureById('suspended').reading(s), null);
  assert.deepEqual(intervalOf(measureById('absence'), { value: 1, se: 5 })!, [0, 1 + 1.96 * 5]);
  assert.equal(intervalOf(measureById('ofsted'), { value: 3, se: null }), null);
});

// ---------- Build and web.ts ----------

test('compare build: standard errors and the national tables', async () => {
  const { rows, metadata } = await buildFromFixtures('compare');
  const all = rows('compare');
  assert.ok(all.size > 0);
  for (const r of all.values()) for (const k of ['cmpP8Se', 'cmpIntakeSe', 'cmpAtt8Se', 'cmpAbsenceSe', 'cmpSuspSe']) {
    const v = r[k];
    assert.ok(v === null || v === undefined || (typeof v === 'number' && v > 0), `${k} = ${String(v)}`);
  }
  const q = metadata.compareQuantiles as Record<string, number[]>;
  for (const t of Object.values(q)) {
    assert.equal(t.length, 101);
    assert.ok(t.every((v, i) => i === 0 || v >= t[i - 1]));
  }
  const avg = metadata.compareAverages as { state: Record<string, number | null>; all: Record<string, number | null> };
  assert.ok(avg.state && avg.all);
});

const school = (o: Partial<School>) => ({ urn: 0, name: '', sector: 'state', ...o }) as School;

test('web: the compare filter keeps the listed URNs, and everything when empty', () => {
  const f = filters[0] as ChipFilter;
  assert.equal(f.id, 'compare');
  assert.equal(f.test(school({ urn: 5 }), ''), true);
  assert.equal(f.test(school({ urn: 5 }), '5,7'), true);
  assert.equal(f.test(school({ urn: 6 }), '5,7'), false);
  assert.equal(f.control.chipText([], '5,7'), '2 schools');
  assert.equal(f.control.chipText([], '5'), '1 school');
});

test('web: the popup button is for state schools only, and the extension is lazy', () => {
  const section = popupSections[0];
  assert.match(String(section.render(school({ urn: 9 }), h, () => [])), /data-compare-toggle="9"/);
  assert.match(String(section.render(school({ urn: 9, sector: 'independent' }), h, () => [])), /Independent schools/);
  assert.equal(extensions[0].id, 'compare');
});
