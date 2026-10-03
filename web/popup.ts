import { OEIF_GRADES, type OeifGrade, type SchoolProperties } from '../shared/school.ts';
import { P8_LABELS, ordinal } from './modes.ts';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmt = (n: number | null, places = 1, suffix = '') => (n === null ? '–' : n.toFixed(places) + suffix);
const signed = (n: number | null, places: number) =>
  n === null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(places);

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const years = (Date.now() - date.getTime()) / (365.25 * 86_400_000);
  const when = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return years >= 2 ? `${when} (${Math.floor(years)} years ago)` : when;
}

const row = (label: string, value: string) => `<tr><th>${label}</th><td>${value}</td></tr>`;

/** Progress 8 score with its 95% confidence interval on a fixed −1.5…+1.5 scale. */
function ciChart(p8: number, lower: number, upper: number): string {
  const min = -1.5;
  const max = 1.5;
  const x = (v: number) => 4 + ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 252;
  return `
    <svg class="ci-chart" viewBox="0 0 260 34" role="img"
         aria-label="Progress 8 ${signed(p8, 2)}, 95% confidence interval ${signed(lower, 2)} to ${signed(upper, 2)}">
      <line class="axis" x1="4" x2="256" y1="14" y2="14" />
      <line class="zero" x1="${x(0)}" x2="${x(0)}" y1="4" y2="24" />
      <line class="range" x1="${x(lower)}" x2="${x(upper)}" y1="14" y2="14" />
      <circle class="point" cx="${x(p8)}" cy="14" r="4" />
      <text x="4" y="32">−1.5</text>
      <text x="${x(0)}" y="32" text-anchor="middle">0 = national average</text>
      <text x="256" y="32" text-anchor="end">+1.5</text>
    </svg>`;
}

function describeSchool(p: SchoolProperties): string {
  const ages = p.ageLow !== null && p.ageHigh !== null ? `ages ${p.ageLow}–${p.ageHigh}` : null;
  const parts = [p.type, p.gender && p.gender !== 'Mixed' ? `${p.gender.toLowerCase()} only` : null, ages];
  return parts.filter(Boolean).map((s) => escapeHtml(s!)).join(' · ');
}

function tags(p: SchoolProperties): string {
  const list: [string, boolean?][] = [];
  if (p.sector === 'independent') list.push(['Independent', true]);
  if (p.selective) list.push(['Selective (grammar)', true]);
  if (p.sixthForm) list.push(['Sixth form']);
  if (p.religion) list.push([p.religion]);
  if (p.trust) list.push([p.trust]);
  return `<div class="tags">${list.map(([t, warn]) => `<span class="tag${warn ? ' warn' : ''}">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function gcseSection(p: SchoolProperties): string {
  if (p.att8 === null) {
    return `<h4>GCSE results</h4><p class="note">No published Attainment 8 score. It may be new, small (suppressed) or not entering GCSEs.</p>`;
  }
  const history = [p.att8Prev, p.att8Prev2].filter((v) => v !== null).map((v) => v.toFixed(1));
  const rows = [
    row('Attainment 8', `${fmt(p.att8)}${p.att8Pct !== null ? ` <span class="muted">(${ordinal(p.att8Pct)} percentile)</span>` : ''}`),
    history.length ? row('Previous years', history.join(', ')) : '',
    p.att8Years > 1 ? row(`${p.att8Years}-year average`, fmt(p.att8Avg)) : '',
    p.att8VsIntake !== null
      ? row('Vs expected for intake', `${signed(p.att8VsIntake, 1)} <span class="muted">(${ordinal(p.att8VsIntakePct!)} percentile)</span>`)
      : '',
    row('English & maths grade 5+', fmt(p.engMaths5, 0, '%')),
    row('Entering EBacc', fmt(p.ebaccEntry, 0, '%')),
    p.disadvantagedPct !== null ? row('Disadvantaged pupils', fmt(p.disadvantagedPct, 0, '%')) : '',
    p.att8Disadvantaged !== null ? row('…their Attainment 8', fmt(p.att8Disadvantaged)) : '',
    p.ks4Cohort !== null ? row('Pupils in year group', String(p.ks4Cohort)) : '',
  ];
  const caveat =
    p.sector === 'independent'
      ? '<p class="note">Many independent schools take IGCSEs, which don’t count towards Attainment 8, so scores can be misleadingly low.</p>'
      : '';
  return `<h4>GCSE results ${escapeHtml(p.ks4Year ?? '')}</h4><table class="stats">${rows.join('')}</table>${caveat}`;
}

function p8Section(p: SchoolProperties): string {
  if (p.p8 === null || p.p8Lower === null || p.p8Upper === null || p.p8Band === null) return '';
  return `
    <h4>Progress 8 ${escapeHtml(p.p8Year ?? '')}</h4>
    <table class="stats">${row(P8_LABELS[p.p8Band], signed(p.p8, 2))}</table>
    ${ciChart(p.p8, p.p8Lower, p.p8Upper)}`;
}

const oeif = (g: OeifGrade | null) => (g === null ? null : OEIF_GRADES[g]);

function ofstedSection(p: SchoolProperties): string {
  const link = p.ofstedUrl ? ` · <a href="${escapeHtml(p.ofstedUrl)}" target="_blank" rel="noopener">reports</a>` : '';
  const predecessor = p.ofstedPredecessor
    ? '<p class="note">This inspection was of a predecessor school, e.g. before it became an academy.</p>'
    : '';
  let body = '';

  if (p.ofstedFramework === 'report-card') {
    const areas: [string, string | null][] = [
      ['Inclusion', p.rcInclusion],
      ['Curriculum and teaching', p.rcCurriculum],
      ['Achievement', p.rcAchievement],
      ['Attendance and behaviour', p.rcAttendance],
      ['Personal development', p.rcPersonalDevelopment],
      ['Leadership and governance', p.rcLeadership],
      ['Post-16', p.rcPost16],
      ['Safeguarding', p.rcSafeguarding],
    ];
    body = `<p class="meta">Report card, ${formatDate(p.ofstedDate)}${link}</p>
      <table class="stats">${areas
        .filter(([, v]) => v)
        .map(([k, v]) => row(k, escapeHtml(v!)))
        .join('')}</table>`;
  } else if (p.ofstedFramework === 'oeif') {
    const areas: [string, string | null][] = [
      ['Overall effectiveness', oeif(p.oeifOverall) ?? 'Not given (from Sept 2024)'],
      ['Quality of education', oeif(p.oeifQuality)],
      ['Behaviour and attitudes', oeif(p.oeifBehaviour)],
      ['Personal development', oeif(p.oeifPersonalDevelopment)],
      ['Leadership and management', oeif(p.oeifLeadership)],
      ['Sixth form', oeif(p.oeifSixthForm)],
    ];
    body = `<p class="meta">Graded inspection, ${formatDate(p.oeifDate)}${link}</p>
      <table class="stats">${areas
        .filter(([, v]) => v)
        .map(([k, v]) => row(k, escapeHtml(v!)))
        .join('')}</table>`;
    if (p.ungradedOutcome && p.ungradedDate && p.oeifDate && p.ungradedDate > p.oeifDate) {
      body += `<p class="note">Later short inspection (${formatDate(p.ungradedDate)}): ${escapeHtml(p.ungradedOutcome)}</p>`;
    }
  } else if (p.ofstedFramework === 'ungraded') {
    body = `<p class="meta">Short inspection, ${formatDate(p.ungradedDate)}${link}</p>
      <table class="stats">${row('Outcome', escapeHtml(p.ungradedOutcome ?? ''))}</table>
      <p class="note">Its last full graded inspection was before 2019 and isn’t in Ofsted’s current data.</p>`;
  } else if (p.sector === 'independent') {
    body = '<p class="note">Most independent schools are inspected by the ISI, not Ofsted.</p>';
  } else {
    body = `<p class="note">No inspection on record. It may be new${link}.</p>`;
  }

  return `<h4>Ofsted</h4>${body}${predecessor}`;
}

export function popupHtml(p: SchoolProperties): string {
  const place = [p.town, p.postcode, p.la].filter(Boolean).map((s) => escapeHtml(s!)).join(', ');
  const website = p.website
    ? ` · <a href="${escapeHtml(p.website)}" target="_blank" rel="noopener">website</a>`
    : '';
  return `
    <div class="school-popup">
      <h3>${escapeHtml(p.name)}</h3>
      <p class="meta">${describeSchool(p)}</p>
      <p class="meta">${place}${website}</p>
      ${tags(p)}
      ${p8Section(p)}
      ${gcseSection(p)}
      ${ofstedSection(p)}
    </div>`;
}
