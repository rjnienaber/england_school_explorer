import { PROGRESS_BANDS, PROGRESS_LABELS, SMALL_COHORT } from './bands.ts';
import { QUINTILES, fmt, signed, quintile, type Metadata, type ModeDef, type PopupSectionDef, type School, type SourceNoteDef } from '../../web/toolkit.ts';

const years = (meta?: Metadata) => (meta?.ks2Years as string[] | undefined) ?? [];
const newest = (meta?: Metadata) => (meta?.ks2Newest as string | null | undefined) ?? years(meta)[0] ?? null;

/** " · 12 pupils (small group)" for a cohort under 30, so a small school's figure is never read without it. */
const smallGroup = (p: School) => (p.ks2Cohort !== null && p.ks2Cohort < SMALL_COHORT ? ` · ${p.ks2Cohort} pupils (small group)` : '');

const SMALL_NOTE =
  'Primary year groups are small, so a school’s result can swing a lot from one year to the next: with 20 pupils, each child is worth 5 percentage points. Schools with under 30 pupils are marked “small group”.';

export const modes: ModeDef[] = [
  {
    id: 'ks2-expected',
    label: 'KS2 expected standard',
    order: 10,
    description: (meta) =>
      `Share of Year 6 pupils reaching the expected standard in reading, writing and maths together (${newest(meta) ?? 'latest'}), as a percentile among state primary schools. ` +
      `${SMALL_NOTE} Results largely reflect who a school admits.`,
    buckets: QUINTILES,
    bucketOf: (p) => quintile(p.ks2RwmExpectedPct),
    sortValue: (p) => p.ks2RwmExpected,
    formatValue: (p) => (p.ks2RwmExpected === null ? '–' : `${p.ks2RwmExpected}%${smallGroup(p)}`),
  },
  {
    id: 'ks2-higher',
    label: 'KS2 higher standard',
    order: 20,
    description: (meta) =>
      `Share of Year 6 pupils reaching the higher standard in reading, writing and maths together (${newest(meta) ?? 'latest'}), as a percentile among state primary schools. ` +
      `${SMALL_NOTE} A good measure of how well a school stretches its strongest pupils.`,
    buckets: QUINTILES,
    bucketOf: (p) => quintile(p.ks2RwmHigherPct),
    sortValue: (p) => p.ks2RwmHigher,
    formatValue: (p) => (p.ks2RwmHigher === null ? '–' : `${p.ks2RwmHigher}%${smallGroup(p)}`),
  },
  {
    id: 'ks2-progress',
    label: 'KS2 progress',
    order: 30,
    description: (meta) =>
      `Progress from the end of Year 2 to the end of Year 6 compared with pupils nationally who started from the same point (${(meta.ks2ProgressYear as string | null) ?? 'latest'}). ` +
      'Above or below average only when most of the reading, writing and maths scores are clearly so (the whole 95% confidence interval, as DfE does for Progress 8); this overall band is our own summary. ' +
      'Published for 2022/23 only: the 2023/24 and 2024/25 Year 6 pupils sat no KS1 tests (cancelled in COVID), so there is nothing to measure from. Numbers are small, so be careful with schools of under 30 pupils.',
    buckets: PROGRESS_BANDS.map((b, i) => ({ label: PROGRESS_LABELS[b], colour: 4 - i * 2 })),
    bucketOf: (p) => (p.ks2ProgressBand ? PROGRESS_BANDS.indexOf(p.ks2ProgressBand) : null),
    sortValue: (p) => p.ks2ProgressMean,
    formatValue: (p) => (p.ks2ProgressMean === null ? '–' : `${signed(p.ks2ProgressMean, 1)} (average of 3)`),
  },
];

export const popupSections: PopupSectionDef[] = [
  {
    id: 'ks2',
    group: 'results',
    order: 10,
    title: (p) => (p.ks2Year === null ? 'KS2 results' : `KS2 results ${p.ks2Year}`),
    render(p, h, _extra, meta) {
      if (p.ks2Year === null) {
        return h.note('No published KS2 results. The school may be new, have very few Year 6 pupils (suppressed), or be an infant or first school with no Year 6.');
      }
      const typical = (key: string) => (meta?.[key] as number | null | undefined) ?? null;
      const pct = (v: number | null) => fmt(v, 0, '%');
      const score = (v: number | null) => fmt(v, 0);
      const line = (label: string, value: string, own: number | null, key: string, show: (v: number | null) => string) =>
        own === null && typical(key) === null ? null : ([label, value, typical(key) === null ? null : show(typical(key))] as const);
      const comparison = h.table(
        ['', 'This school', 'Typical primary'],
        [
          line('Expected: reading, writing, maths', pct(p.ks2RwmExpected), p.ks2RwmExpected, 'ks2MedianRwmExpected', pct),
          line('Higher: reading, writing, maths', pct(p.ks2RwmHigher), p.ks2RwmHigher, 'ks2MedianRwmHigher', pct),
          line('Expected: reading', pct(p.ks2ReadExpected), p.ks2ReadExpected, 'ks2MedianReadExpected', pct),
          line('Expected: writing', pct(p.ks2WriteExpected), p.ks2WriteExpected, 'ks2MedianWriteExpected', pct),
          line('Expected: maths', pct(p.ks2MathsExpected), p.ks2MathsExpected, 'ks2MedianMathsExpected', pct),
          line('Higher: reading', pct(p.ks2ReadHigher), p.ks2ReadHigher, 'ks2MedianReadHigher', pct),
          line('Higher: writing', pct(p.ks2WriteHigher), p.ks2WriteHigher, 'ks2MedianWriteHigher', pct),
          line('Higher: maths', pct(p.ks2MathsHigher), p.ks2MathsHigher, 'ks2MedianMathsHigher', pct),
          line('Reading score', score(p.ks2ReadScore), p.ks2ReadScore, 'ks2MedianReadScore', score),
          line('Maths score', score(p.ks2MathsScore), p.ks2MathsScore, 'ks2MedianMathsScore', score),
        ].map((r) => (r ? [...r] : null)),
      );

      // This year and the two before it, then DfE's three-year average; the cohort beside each so small years are plain
      const labels = years(meta);
      const at = labels.indexOf(p.ks2Year);
      const history = [
        [p.ks2Year, p.ks2RwmExpected, p.ks2RwmHigher, p.ks2Cohort],
        [labels[at + 1], p.ks2RwmExpectedPrev, p.ks2RwmHigherPrev, p.ks2CohortPrev],
        [labels[at + 2], p.ks2RwmExpectedPrev2, p.ks2RwmHigherPrev2, p.ks2CohortPrev2],
      ].filter(([year, expected]) => year !== undefined && expected !== null);
      const average = p.ks2RwmExpectedAvg === null ? null : ['3-year average', p.ks2RwmExpectedAvg, p.ks2RwmHigherAvg, p.ks2Cohort3yr];
      const trend =
        history.length > 1 || average
          ? h.table(
              ['Reading, writing, maths', 'Expected', 'Higher', 'Pupils'],
              [...history, average].map((r) => (r ? [r[0], pct(r[1] as number | null), pct(r[2] as number | null), r[3] === null ? null : String(r[3])] : null)),
            )
          : null;

      const small =
        p.ks2Cohort !== null && p.ks2Cohort < SMALL_COHORT
          ? h.note(
              `Only ${p.ks2Cohort} pupils took the tests, so each pupil is worth about ${Math.round(100 / Math.max(p.ks2Cohort, 1))} percentage points and the result can swing a lot from year to year.` +
                (p.ks2RwmExpectedAvg !== null ? ` The 3-year average is steadier.` : ''),
            )
          : null;
      const cohort = p.ks2Cohort === null ? null : h.rows([['Pupils who took the tests', String(p.ks2Cohort)]]);
      return h.html`${cohort}${small}${comparison}${trend}${h.note(
        'Expected standard is a scaled score of 100 or more in reading and maths; the higher standard is 110 or more. Writing is judged by teachers, so it has no score. “Typical primary” is the median state primary school. Results largely reflect who a school admits.',
      )}`;
    },
  },
  {
    id: 'ks2-progress',
    group: 'results',
    order: 20,
    title: (p) => `KS2 progress ${p.ks2ProgressYear ?? ''}`,
    render(p, h) {
      if (p.ks2ProgressBand === null) return null;
      const AXIS = 8;
      const chart = (name: string, value: number | null, lower: number | null, upper: number | null) =>
        value === null || lower === null || upper === null
          ? null
          : h.html`<div class="ci-row"><div class="ci-head"><span>${name}</span><strong>${signed(value, 1)}</strong></div>${h.ciChart({
              value,
              lower,
              upper,
              min: -AXIS,
              max: AXIS,
              name: `${name} progress`,
              zeroLabel: '',
              decimals: 1,
              compact: true,
            })}</div>`;
      const older =
        p.ks2Year !== null && p.ks2ProgressYear !== null && p.ks2Year !== p.ks2ProgressYear
          ? h.note(`Progress was last published for ${p.ks2ProgressYear}, so it describes an older group of pupils than the results above.`)
          : null;
      return h.html`${h.rows([[PROGRESS_LABELS[p.ks2ProgressBand], p.ks2ProgressMean === null ? null : `${signed(p.ks2ProgressMean, 1)} on average`]])}${chart('Reading', p.ks2ReadProgress, p.ks2ReadProgressLower, p.ks2ReadProgressUpper)}${chart('Writing', p.ks2WriteProgress, p.ks2WriteProgressLower, p.ks2WriteProgressUpper)}${chart('Maths', p.ks2MathsProgress, p.ks2MathsProgressLower, p.ks2MathsProgressUpper)}${older}${h.note(
        'Progress compares pupils with others nationally who had the same KS1 results at age 7. The dashed line is 0, average; the bar is the 95% confidence interval, so a bar that crosses the line is not clearly different from average. The overall band is our own summary of the three. It is published for 2022/23 only (the 2023/24 and 2024/25 pupils sat no KS1 tests because of COVID), and small schools’ scores are less reliable.',
      )}`;
    },
  },
];

export const sourceNotes: SourceNoteDef[] = [
  {
    id: 'ks2',
    order: 10,
    about: (meta, h) =>
      h.html`${h.sourceLink('ks2', 'DfE key stage 2 attainment')} (${years(meta).join(', ')}), with ${h.sourceLink('ks2-info', 'pupil numbers')}`,
    dates: (meta) => [newest(meta) && `KS2 ${newest(meta)}`, meta.ks2ProgressYear ? `KS2 progress ${meta.ks2ProgressYear as string}` : null],
  },
  {
    id: 'primary-no-compare',
    order: 96,
    about: (_meta, h) =>
      h.html`<strong>Shortlists and similar schools are secondary only.</strong> A primary school’s result comes from a year group of often 20 to 40 pupils, and the only intake-adjusted measure (KS2 progress) was published for 2022/23 alone, so there is no fair basis for ranking two primaries against each other. Use the percentile, the cohort size and the three-year average in each popup instead.`,
  },
];
