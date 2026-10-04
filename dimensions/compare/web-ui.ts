// The shortlist comparison's interface: a panel block listing the shortlisted schools, and a full-screen dialog
// with the comparison table, head-to-head matrix, "beaten on every measure", priorities and the equal-preference
// note. Loaded only when the page starts (see web.ts), so the Node-side build never sees this file.

import './compare.css';
import { escapeHtml as esc, type AppApi, type Metadata, type School } from '../../web/toolkit.ts';
import { parseSimilar } from '../similar-schools/shared.ts';
import { GROUP_TITLES, MEASURES, OFSTED_RANK, intervalOf, measureById, nationalFields, type MeasureDef, type MeasureGroup } from './measures.ts';
import { describeBand, drawScores, rankBand, NATIONAL_DRAWS, type PopMeasure } from './national.ts';
import { MAX_SHORTLIST, parseShortlist, shortlistValue, withSchool, withoutSchool } from './shortlist.ts';
import { DRAWS, SEED, placeRange, simulateShortlist, type SimMeasure } from './simulate.ts';
import { beatenBy, compareReadings, rowVerdict, type Profile, type Reading } from './stats.ts';
import { pairSentence, verdictText } from './wording.ts';

const STORE = 'schools-shortlist';
const GOV_APPLY = 'https://www.gov.uk/apply-for-secondary-school-place';
const GOV_COUNCIL = 'https://www.gov.uk/find-local-council';

interface Averages {
  p8: number | null;
  att8: number | null;
  engMaths5: number | null;
  engMaths4: number | null;
  absence: number | null;
  suspended: number | null;
  suspensionRate: number | null;
  ofstedGoodPct: number | null;
}

const place = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

export function start(app: AppApi): void {
  const data = app.data;
  const meta = data.core.metadata as Metadata;
  let list: number[] = [];
  let dialogOpen = false;
  /** Measures ticked in the priorities block and their weights (0-10). */
  const counted = new Set(MEASURES.filter((m) => m.byDefault).map((m) => m.id));
  const weights: Record<string, number> = Object.fromEntries(MEASURES.map((m) => [m.id, 5]));
  let matrixId = 'p8';
  let pairText = '';
  let pairKey = '';
  /** True while `list` is someone else's shortlist from a `?compare=` link: it is shown but never saved over the viewer's own. */
  let shared = false;

  // ---------- Shortlist storage ----------
  const save = () => {
    if (shared) return;
    try {
      localStorage.setItem(STORE, shortlistValue(list));
    } catch {
      /* private window: the list lasts for this visit */
    }
  };
  const known = (urns: number[]) => urns.filter((u) => data.byUrn.has(u));
  const fromLink = parseShortlist(new URLSearchParams(location.search).get('compare'));
  const saved = (): number[] => {
    try {
      return known(parseShortlist(localStorage.getItem(STORE)));
    } catch {
      return [];
    }
  };
  // Opening a link shows its list without touching the viewer's own saved shortlist
  let mine = saved();
  if (fromLink.length) {
    list = known(fromLink);
    shared = shortlistValue(list) !== shortlistValue(mine);
  } else {
    list = mine;
  }
  const school = (urn: number) => data.byUrn.get(urn)!.properties;
  const isState = (urn: number) => school(urn).sector === 'state';

  // ---------- Panel block ----------
  const panel = document.createElement('section');
  panel.className = 'cmp-panel';
  panel.setAttribute('aria-label', 'Shortlist');
  app.addPanelSection(panel);

  const dialog = document.createElement('dialog');
  dialog.className = 'cmp-dialog';
  dialog.setAttribute('aria-labelledby', 'cmp-title');
  document.body.append(dialog);

  const linkFor = () => {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    return `${url.toString()}?compare=${shortlistValue(list)}`;
  };

  function renderPanel(): void {
    panel.hidden = list.length === 0 && !shared;
    const banner = shared
      ? `<p class="cmp-shared" role="status">You are viewing a shared shortlist. Your own saved shortlist (${mine.length} school${mine.length === 1 ? '' : 's'}) has not been changed.</p><div class="cmp-actions"><button type="button" class="cmp-btn" data-cmp="keep">Save as my shortlist</button><button type="button" class="link-button" data-cmp="mine">Back to mine</button></div>`
      : '';
    panel.innerHTML = `<h2>${shared ? 'Shared shortlist' : 'Shortlist'} (${list.length} of ${MAX_SHORTLIST})</h2>${banner}<ul>${list
      .map((u) => `<li><button type="button" class="link-button" data-cmp-open="${u}">${esc(school(u).name)}</button><button type="button" class="cmp-x" data-cmp-remove="${u}" aria-label="Remove ${esc(school(u).name)} from the shortlist">✕</button></li>`)
      .join('')}</ul><div class="cmp-actions"><button type="button" class="cmp-btn" data-cmp="compare"${list.length < 2 ? ' disabled' : ''}>Compare</button><button type="button" class="link-button" data-cmp="map">Show on map</button><button type="button" class="link-button" data-cmp="copy">Copy link</button></div>${list.length < 2 ? '<p class="note">Add at least two schools (from a school’s popup) to compare them.</p>' : ''}`;
    refreshButtons();
  }

  function refreshButtons(): void {
    for (const b of document.querySelectorAll<HTMLElement>('[data-compare-toggle]')) {
      const urn = Number(b.dataset.compareToggle);
      const label = list.includes(urn) ? 'Remove from shortlist' : list.length >= MAX_SHORTLIST ? `Shortlist full (${MAX_SHORTLIST})` : 'Add to shortlist';
      if (b.textContent !== label) b.textContent = label;
    }
  }
  new MutationObserver(refreshButtons).observe(document.body, { childList: true, subtree: true });

  function change(next: number[]): void {
    list = next;
    if (!shared) mine = next;
    save();
    renderPanel();
    if (app.focusValue('compare')) void app.setFocus('compare', list.length ? shortlistValue(list) : '');
    if (dialogOpen) {
      if (list.length < 2) dialog.close();
      else void render();
    }
  }

  async function copyLink(button: HTMLElement): Promise<void> {
    const text = linkFor();
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Link copied';
    } catch {
      window.prompt('Copy this link', text);
    }
    setTimeout(() => (button.textContent = 'Copy link'), 2000);
  }

  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const toggle = target.closest<HTMLElement>('[data-compare-toggle]');
    if (toggle) {
      const urn = Number(toggle.dataset.compareToggle);
      change(list.includes(urn) ? withoutSchool(list, urn) : withSchool(list, urn));
      return;
    }
    const open = target.closest<HTMLElement>('[data-cmp-open]');
    if (open) {
      if (dialogOpen) dialog.close();
      app.openSchool(Number(open.dataset.cmpOpen), true);
      return;
    }
    const remove = target.closest<HTMLElement>('[data-cmp-remove]');
    if (remove) return change(withoutSchool(list, Number(remove.dataset.cmpRemove)));
    const act = target.closest<HTMLElement>('[data-cmp]');
    if (!act) return;
    switch (act.dataset.cmp) {
      case 'compare':
        return void openDialog();
      case 'map':
        if (dialogOpen) dialog.close();
        if (app.isNarrow()) app.collapsePanel();
        return void app.setFocus('compare', shortlistValue(list));
      case 'copy':
        return void copyLink(act);
      case 'keep':
        shared = false;
        mine = list;
        save();
        return renderPanel();
      case 'mine':
        shared = false;
        return change(mine);
      case 'close':
        return dialog.close();
      case 'similar': {
        const p = school(Number(act.dataset.urn));
        let next = list;
        for (const u of parseSimilar(p.similarUrns)) if (data.byUrn.has(u) && isState(u)) next = withSchool(next, u);
        return change(next);
      }
    }
  });
  dialog.addEventListener('close', () => (dialogOpen = false));

  // ---------- Readings ----------
  const readingsOf = (m: MeasureDef): (Reading | null)[] => list.map((u) => m.reading(school(u), meta));
  const averages = (meta.compareAverages ?? null) as { state: Averages; all: Averages } | null;
  const avgKey: Record<string, keyof Averages> = { p8: 'p8', att8: 'att8', engMaths5: 'engMaths5', engMaths4: 'engMaths4', absence: 'absence', suspended: 'suspended' };
  const avgText = (m: MeasureDef, set: 'state' | 'all'): string => {
    if (!averages) return '–';
    if (m.id === 'ofsted') {
      const v = averages[set].ofstedGoodPct;
      return v === null ? '–' : `${v}% Good or Outstanding`;
    }
    const key = avgKey[m.id];
    const v = key ? averages[set][key] : null;
    return v === null || v === undefined ? '–' : m.format(v);
  };

  // ---------- Table ----------
  const p8Notice = (): string => {
    const latest = (meta.ks4Years as string[] | undefined)?.[0];
    const p8s = list.map((u) => school(u)).filter((p) => p.p8 !== null);
    const missing = list.filter((u) => school(u).p8 === null).map((u) => esc(school(u).name));
    const old = [...new Set(p8s.map((p) => p.p8Year).filter((y): y is string => !!y && !!latest && y !== latest))];
    const parts: string[] = [];
    if (old.length && latest) parts.push(`Progress 8 has not been published for ${esc(latest)}, so the figures here are from ${old.map(esc).join(' and ')}, a year older than the other results.`);
    if (missing.length) parts.push(`No Progress 8 is available for ${missing.join(', ')}. Without it the “school effect” rows lean on our own estimate (results vs intake), where one exists.`);
    return parts.length ? `<p class="cmp-notice">${parts.join(' ')}</p>` : '';
  };

  function tableHtml(): string {
    const head = list
      .map((u) => `<th scope="col"><button type="button" class="link-button" data-cmp-open="${u}">${esc(school(u).name)}</button><span class="cmp-sub">${esc(school(u).la ?? '')}${school(u).selective ? ' · selective' : ''}</span><button type="button" class="cmp-x" data-cmp-remove="${u}" aria-label="Remove ${esc(school(u).name)}">✕ remove</button></th>`)
      .join('');
    const cols = list.length + 3;
    let body = '';
    for (const group of Object.keys(GROUP_TITLES) as MeasureGroup[]) {
      const rows = MEASURES.filter((m) => m.group === group && readingsOf(m).some((r) => r));
      if (!rows.length) continue;
      body += `<tr class="cmp-group"><th colspan="${cols}" scope="colgroup"><div class="cmp-group-text">${esc(GROUP_TITLES[group].title)}<span>${esc(GROUP_TITLES[group].note)}</span></div></th></tr>`;
      for (const m of rows) {
        const rs = readingsOf(m);
        const years = new Set(list.map((u) => m.year(school(u))).filter(Boolean));
        const cells = rs
          .map((r, i) => {
            if (!r) return `<td class="cmp-na">${m.id === 'p8' ? 'Not published' : 'No figure'}</td>`;
            const iv = intervalOf(m, r);
            const v = list.length > 1 ? verdictText(m, rowVerdict(rs, i, m.higherIsBetter)) : null;
            const sym = v?.kind === 'best' || v?.kind === 'better' ? '▲ ' : v?.kind === 'worse' ? '▼ ' : v?.kind === 'mixed' ? '◆ ' : v ? '● ' : '';
            const yr = m.id === 'p8' ? m.year(school(list[i])) : null;
            return `<td${v?.kind === 'best' ? ' class="cmp-best"' : ''}><strong>${esc(m.format(r.value))}</strong>${iv ? `<span class="cmp-sub">95% range ${esc(m.format(iv[0]))} to ${esc(m.format(iv[1]))}</span>` : ''}${yr ? `<span class="cmp-sub">${esc(yr)}</span>` : ''}${v ? `<span class="cmp-v ${v.kind}">${sym}${esc(v.text)}</span>` : ''}</td>`;
          })
          .join('');
        body += `<tr><th scope="row" class="cmp-label" title="${esc(m.about)}">${esc(m.label)}<span class="cmp-sub">${years.size ? esc([...years].join(', ')) : ''}</span></th>${cells}<td class="cmp-avg">${esc(avgText(m, 'state'))}</td><td class="cmp-avg">${esc(avgText(m, 'all'))}</td></tr>`;
      }
    }
    // Context rows with no verdict
    const info: [string, (p: School) => string | null][] = [
      ['Place among similar schools (Attainment 8)', (p) => (p.similarAtt8Rank !== null && p.similarAtt8Of !== null ? `${place(p.similarAtt8Rank)} of ${p.similarAtt8Of}` : null)],
      ['Suspensions per 100 pupils', (p) => (p.suspensionRate !== null ? p.suspensionRate.toFixed(1) : null)],
    ];
    body += `<tr class="cmp-group"><th colspan="${cols}" scope="colgroup"><div class="cmp-group-text">For context (no verdict)</div></th></tr>`;
    for (const [label, pick] of info) {
      const vals = list.map((u) => pick(school(u)));
      if (!vals.some(Boolean)) continue;
      const avg = label.startsWith('Suspensions') && averages ? [averages.state.suspensionRate, averages.all.suspensionRate].map((v) => (v === null ? '–' : v.toFixed(1))) : ['', ''];
      body += `<tr><th scope="row" class="cmp-label">${esc(label)}</th>${vals.map((v) => `<td${v ? '' : ' class="cmp-na"'}>${v ? esc(v) : 'No figure'}</td>`).join('')}<td class="cmp-avg">${avg[0]}</td><td class="cmp-avg">${avg[1]}</td></tr>`;
    }
    return `<div class="cmp-scroll" tabindex="0" role="region" aria-label="Comparison table, scrolls sideways"><table class="cmp-table"><thead><tr><th scope="col" class="cmp-label">Measure</th>${head}<th scope="col" class="cmp-avg">England average, state-funded schools*</th><th scope="col" class="cmp-avg">England average, all schools*</th></tr></thead><tbody>${body}</tbody></table></div><p class="note">* Our own calculation: the average of the schools on this map, weighted by the pupils each figure is based on. DfE’s official England figures cover some schools this map leaves out, so they differ a little. “▲ Likely better” means at least a 90% chance that the school’s real figure is higher (or lower where lower is better), allowing for chance variation only.</p>`;
  }

  // ---------- Head to head ----------
  function matrixHtml(): string {
    const usable = MEASURES.filter((x) => readingsOf(x).filter((r) => r).length >= 2);
    if (!usable.some((x) => x.id === matrixId) && usable.length) matrixId = usable[0].id;
    const cur = measureById(matrixId);
    const rows = readingsOf(cur);
    const head = list.map((u) => `<th scope="col">${esc(school(u).name)}</th>`).join('');
    const body = list
      .map((a, i) => {
        const cells = list
          .map((b, j) => {
            if (i === j) return '<td class="cmp-self" aria-hidden="true"></td>';
            const c = compareReadings(rows[i], rows[j], cur.higherIsBetter);
            if (!c) return '<td class="cmp-na">n/a</td>';
            const sym = c.verdict === 'better' ? '▲ Better' : c.verdict === 'worse' ? '▼ Worse' : '● Unclear';
            return `<td><button type="button" class="${c.verdict}" data-pair="${i}-${j}" aria-pressed="${pairKey === `${i}-${j}`}">${sym}</button></td>`;
          })
          .join('');
        return `<tr><th scope="row" class="cmp-label">${esc(school(a).name)}</th>${cells}</tr>`;
      })
      .join('');
    return `<label>Measure <select id="cmp-matrix-measure">${usable.map((x) => `<option value="${x.id}"${x.id === matrixId ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label><p class="note">Each row school against each column school: “Better” means a 90% or higher chance that the row school really is ahead on this measure, “Worse” 10% or lower. Tap a cell for the probability.</p><div class="cmp-scroll"><table class="cmp-table cmp-matrix"><thead><tr><th scope="col" class="cmp-label">Row vs column</th>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="cmp-pair" id="cmp-pair" role="status" aria-live="polite">${esc(pairText)}</p>`;
  }

  function showPair(i: number, j: number): void {
    const m = measureById(matrixId);
    const rs = readingsOf(m);
    const c = compareReadings(rs[i], rs[j], m.higherIsBetter);
    if (!c) return;
    pairKey = `${i}-${j}`;
    pairText = pairSentence(m, school(list[i]).name, school(list[j]).name, c.prob, c.verdict);
    const el = dialog.querySelector('#cmp-pair');
    if (el) el.textContent = pairText;
    for (const b of dialog.querySelectorAll<HTMLElement>('[data-pair]')) b.setAttribute('aria-pressed', String(b.dataset.pair === pairKey));
  }

  // ---------- Beaten on every measure ----------
  function beatenHtml(): string {
    const ms = MEASURES.filter((m) => counted.has(m.id));
    const profiles: Profile[] = list.map((u) => ({ id: u, readings: ms.map((m) => m.reading(school(u), meta)) }));
    const beaten = beatenBy(profiles, ms.map((m) => m.higherIsBetter));
    const names = ms.map((m) => m.label).join(', ');
    const rows = list.flatMap((u, i) => (beaten[i] === null ? [] : [`<li><strong>${esc(school(u).name)}</strong> is beaten on every measure by <strong>${esc(school(beaten[i]!).name)}</strong>: at least as good on all of them and likely better on at least one.</li>`]));
    if (!ms.length) return '<p class="note">Tick at least one measure below.</p>';
    if (rows.length === 0) return `<p>No school on the list is beaten on every measure (${esc(names)}): each is ahead of the others somewhere, so which is best depends on what matters most to you.</p>`;
    const unmarked = list.filter((_, i) => beaten[i] === null).map((u) => `<strong>${esc(school(u).name)}</strong>`);
    return `<ul>${rows.join('')}</ul><p class="cmp-rule">The schools not marked above (${unmarked.join(', ')}) are the ones where your priorities decide. Nothing on these figures separates them for everyone.</p><p class="note">Measures counted: ${esc(names)}. Where a school has no figure for a measure, that measure is skipped for that pair rather than counted against it. The check uses each school’s published figure; “likely better” needs a 90% chance.</p>`;
  }

  // ---------- Priorities and simulation ----------
  const simMeasures = (): SimMeasure[] =>
    MEASURES.map((m) => ({
      weight: counted.has(m.id) ? weights[m.id] : 0,
      higherIsBetter: m.higherIsBetter,
      table: m.ordinal ? null : ((meta.compareQuantiles as Record<string, number[]> | undefined)?.[m.id] ?? null),
      gradePercentile: m.ordinal ? ((meta.compareGradePercentiles ?? {}) as Record<number, number>) : undefined,
    }));

  function simHtml(): string {
    const ms = simMeasures();
    // A measure with no percentile table (not in the data) cannot be scored
    const usable = ms.map((s) => (s.table || s.gradePercentile ? s : { ...s, weight: 0 }));
    const result = simulateShortlist(
      list.map((u) => ({ id: u, readings: MEASURES.map((m) => m.reading(school(u), meta)) })),
      usable,
      DRAWS,
      SEED,
    );
    const rows = list
      .map((u, i) => ({ u, i, chance: result.strongest[i] }))
      .sort((a, b) => (b.chance ?? -1) - (a.chance ?? -1));
    const top = rows[0]?.chance ?? null;
    const items = rows
      .map(({ u, i, chance }) => {
        if (chance === null) return `<div class="cmp-result"><span>${esc(school(u).name)}</span><span class="cmp-na">No figures on the measures you ticked</span></div>`;
        const r = placeRange(result.places[i], DRAWS);
        const where = r.lo === r.hi ? `${place(r.lo)}` : `${place(r.lo)} to ${place(r.hi)}`;
        return `<div class="cmp-result"><span><strong>${esc(school(u).name)}</strong></span><span><span class="cmp-bar" aria-hidden="true"><i style="width:${Math.round(chance * 100)}%"></i></span></span><small>Strongest on your priorities in ${Math.round(chance * 100)}% of ${DRAWS} simulated draws. Likely place: ${where} of ${list.length} (${Math.round(r.share * 100)}% of draws).</small></div>`;
      })
      .join('');
    const verdict =
      top === null
        ? ''
        : top < 0.6
          ? `<p class="cmp-rule"><strong>A matter of preference.</strong> No school is clearly strongest on these priorities: their likely places overlap, so the figures cannot separate them. Visits, travel and what you know about each school should decide.</p>`
          : `<p class="cmp-rule">On these priorities <strong>${esc(school(rows[0].u).name)}</strong> comes out strongest most often (${Math.round(top * 100)}%), though the figures cannot see everything that matters about a school.</p>`;
    return `<div class="cmp-results">${items}</div>${verdict}`;
  }

  function weightsHtml(): string {
    return `<div class="cmp-weights">${MEASURES.filter((m) => readingsOf(m).some((r) => r))
      .map(
        (m) =>
          `<div class="cmp-weight"><label title="${esc(m.about)}"><input type="checkbox" data-count="${m.id}"${counted.has(m.id) ? ' checked' : ''}> ${esc(m.label)}</label><input type="range" min="0" max="10" step="1" value="${weights[m.id]}" data-weight="${m.id}" aria-label="Weight of ${esc(m.label)}"><output>${weights[m.id]}</output></div>`,
      )
      .join('')}</div><p class="note">Tick the measures that matter to you and set how much. Percentile scores among England’s state-funded schools are combined with these weights; each draw varies every figure within its uncertainty. The same seed is used each time, so the answer does not change when you reload.</p>`;
  }

  function updatePriorities(): void {
    const set = (sel: string, html: string) => {
      const el = dialog.querySelector(sel);
      if (el) el.innerHTML = html;
    };
    set('#cmp-beaten', beatenHtml());
    set('#cmp-sim', simHtml());
    set('#cmp-national', nationalIdle());
  }

  // ---------- National rank band (on request) ----------
  let working = false;
  const nationalIdle = () =>
    `<p><button type="button" class="cmp-btn quiet" data-cmp-national>Estimate where each might rank in England</button></p><p class="note">Simulates every state-funded school’s uncertainty ${NATIONAL_DRAWS} times, so it takes a few seconds and loads one extra data column per measure. Pass rates have no whole-country column, so they are left out.</p>`;

  async function nationalBand(): Promise<void> {
    if (working) return;
    working = true;
    const out = dialog.querySelector('#cmp-national')!;
    out.innerHTML = '<p role="status">Working it out…</p>';
    try {
      const ms = MEASURES.filter((m) => counted.has(m.id) && weights[m.id] > 0 && m.national);
      await data.ensureFields(nationalFields(ms.map((m) => m.id)));
      const pop = data.features.filter((f) => f.properties.sector === 'state');
      const n = pop.length;
      const grades = (meta.compareGradePercentiles ?? {}) as Record<number, number>;
      const quant = meta.compareQuantiles as Record<string, number[]> | undefined;
      const measures: PopMeasure[] = ms.map((m) => {
        const nat = m.national!;
        const values = new Float64Array(n);
        const ses = new Float64Array(n);
        pop.forEach((f, i) => {
          const raw = (f.properties as unknown as Record<string, unknown>)[nat.value as string];
          values[i] = m.ordinal ? (typeof raw === 'string' && raw in OFSTED_RANK ? OFSTED_RANK[raw as keyof typeof OFSTED_RANK] : NaN) : typeof raw === 'number' ? raw : NaN;
          const se = nat.se ? (f.properties as unknown as Record<string, unknown>)[nat.se as string] : null;
          ses[i] = typeof se === 'number' ? se : NaN;
        });
        return { weight: weights[m.id], higherIsBetter: m.higherIsBetter, table: m.ordinal ? null : (quant?.[m.id] ?? null), gradePercentile: m.ordinal ? grades : undefined, values, ses };
      });
      const scores = await drawScores(measures, n, NATIONAL_DRAWS, 7, 10);
      const w = measures.map((m) => m.weight);
      const items = list.map((u) => {
        const idx = pop.findIndex((f) => f.properties.urn === u);
        const r = idx < 0 ? null : rankBand(scores, w, n, NATIONAL_DRAWS, idx);
        if (!r) return `<li><strong>${esc(school(u).name)}</strong>: no figures on the measures counted, so no rank band.</li>`;
        return `<li><strong>${esc(school(u).name)}</strong>: ${esc(describeBand(r.band))} of ${r.band.of} state-funded schools (10th to 90th percentile of draws: ${place(r.band.p10)} to ${place(r.band.p90)}). ${r.stable ? 'Stable: it holds if any one weight is halved or raised by half.' : 'Not stable: it moves outside this range when a weight changes by half, so it depends on your priorities.'}</li>`;
      });
      out.innerHTML = `<ul>${items.join('')}</ul><p class="note">Measures used: ${esc(ms.map((m) => m.label).join(', '))}. Change the weights above and press the button again to update. A school’s ranking on its published figures can differ by a wide margin from its true standing.</p>${nationalIdle().split('</p>')[0]}</p>`;
    } catch (err) {
      out.innerHTML = `<p class="note">Couldn’t work this out: ${esc(err instanceof Error ? err.message : String(err))}</p>${nationalIdle()}`;
    } finally {
      working = false;
    }
  }

  // ---------- Like with like ----------
  function likeHtml(): string {
    const kinds = new Set(list.map((u) => school(u).selective));
    const warn = kinds.size > 1 ? '<p class="cmp-notice">This list mixes selective and non-selective schools. Selective schools admit pupils by test, so their raw results are not comparable with the others. Rely on the “school effect” rows.</p>' : '';
    const buttons = list
      .filter((u) => parseSimilar(school(u).similarUrns).some((s) => !list.includes(s) && isState(s)))
      .map((u) => `<button type="button" class="cmp-btn quiet" data-cmp="similar" data-urn="${u}"${list.length >= MAX_SHORTLIST ? ' disabled' : ''}>Add schools similar to ${esc(school(u).name)}</button>`)
      .join(' ');
    return `${warn}${buttons ? `<p>Compare like with like: add the schools whose intake is most like a school on your list (our own grouping, not an official one).</p><div class="cmp-actions">${buttons}</div>` : ''}`;
  }

  // ---------- Equal preference ----------
  function admissionsHtml(): string {
    const las = [...new Set(list.map((u) => school(u).la).filter(Boolean))];
    return `<p>Under the School Admissions Code, every school you list is considered equally: a school does not know where you ranked it. Councils offer the highest-ranked school on your list that can offer your child a place, so <strong>list the schools in your true order of preference</strong>. Listing a very popular school first does not reduce your chance at the others, and listing a school lower does not improve it. Admission rules, such as distance or sibling priority, decide who gets a place, not these figures.</p><p><a href="${GOV_APPLY}" target="_blank" rel="noopener">Apply for a secondary school place (GOV.UK)</a> · <a href="${GOV_COUNCIL}" target="_blank" rel="noopener">Find your council’s admissions page${las.length ? ` (${las.map(esc).join(', ')})` : ''}</a></p>`;
  }

  // ---------- The dialog ----------
  async function render(): Promise<void> {
    if (list.length < 2) return;
    const scroll = dialog.querySelector('.cmp-body')?.scrollTop ?? 0;
    dialog.innerHTML = `<div class="cmp-head"><h2 id="cmp-title">Comparing ${list.length} schools</h2><button type="button" class="cmp-btn quiet" data-cmp="close">Close</button></div><div class="cmp-body"><p role="status">Loading the schools’ details…</p></div>`;
    try {
      await Promise.all(list.map((u) => data.getDetails(u)));
    } catch (err) {
      dialog.querySelector('.cmp-body')!.innerHTML = `<p class="note">Couldn’t load the details: ${esc(err instanceof Error ? err.message : String(err))}</p>`;
      return;
    }
    dialog.innerHTML = `<div class="cmp-head"><h2 id="cmp-title">Comparing ${list.length} schools</h2><button type="button" class="cmp-btn quiet" data-cmp="close">Close</button></div><div class="cmp-body">
      <p class="note">A comparison of published figures, with the uncertainty in each. Standard errors allow for chance variation only and understate the real uncertainty, so treat a “likely better” as weaker than it sounds.</p>
      ${p8Notice()}
      <h3>The figures</h3>${tableHtml()}
      <h3>Head to head</h3>${matrixHtml()}
      <h3>Beaten on every measure?</h3><div id="cmp-beaten"></div>
      <h3>What matters to you</h3>${weightsHtml()}<div id="cmp-sim"></div><div id="cmp-national"></div>
      <h3>Like with like</h3>${likeHtml()}
      <h3>Applying: equal preference</h3>${admissionsHtml()}
      <h3>How far to trust this</h3><p>Results largely reflect who a school admits. Progress 8 and “results vs intake” try to allow for that and are the only measures here that speak to the school itself. Even those are noisy: published research on school league tables (Goldstein and Spiegelhalter, 1996; Leckie and Goldstein, 2017) finds that a school’s past results predict a child’s own progress only loosely. Use this to ask better questions on a visit, not to pick a winner.</p>
      <div class="cmp-actions"><button type="button" class="cmp-btn" data-cmp="map">Show on map</button><button type="button" class="cmp-btn quiet" data-cmp="copy">Copy link</button></div></div>`;
    updatePriorities();
    const body = dialog.querySelector('.cmp-body');
    if (body) body.scrollTop = scroll;
  }

  dialog.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const pair = target.closest<HTMLElement>('[data-pair]');
    if (pair) {
      const [i, j] = pair.dataset.pair!.split('-').map(Number);
      showPair(i, j);
    } else if (target.closest('[data-cmp-national]')) void nationalBand();
  });
  dialog.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'cmp-matrix-measure') {
      matrixId = t.value;
      pairText = '';
      pairKey = '';
      void render();
    } else if (t.dataset.count) {
      if (t.checked) counted.add(t.dataset.count);
      else counted.delete(t.dataset.count);
      updatePriorities();
    } else if (t.dataset.weight) {
      weights[t.dataset.weight] = Number(t.value);
      const out = t.parentElement?.querySelector('output');
      if (out) out.textContent = t.value;
      updatePriorities();
    }
  });
  dialog.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.weight) {
      const out = t.parentElement?.querySelector('output');
      if (out) out.textContent = t.value;
    }
  });

  async function openDialog(): Promise<void> {
    if (list.length < 2) return;
    if (!dialog.open) dialog.showModal();
    dialogOpen = true;
    await render();
  }

  renderPanel();
  if (fromLink.length >= 2) void openDialog();
}
