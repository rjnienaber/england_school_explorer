import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, LayerSpecification, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { SchoolFeature, SchoolRecord } from './types.ts';
import { loadCore, StaleDataError, type SchoolData } from './data.ts';
import { drawOrder, PALETTES, type Theme } from './palette.ts';
import { choosePhase, DEFAULT_PHASE, isPhase, PHASES, type Phase } from '../lib/phase.ts';
import { registryFor } from './registry.ts';
import { FILTER_GROUPS, h, type AppApi, type ChipFilter, type FilterDef, type FilterGroupId, type ModeDef } from './toolkit.ts';
import { popupHtml } from './popup.ts';
import { bindAbout } from './about.ts';
import './style.css';

const STYLES: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const ENGLAND: [[number, number], [number, number]] = [
  [-5.8, 49.9],
  [1.8, 55.8],
];
const LIST_LIMIT = 30;
const PHASE_KEY = 'schools-map-phase';

// ---------- Phase (secondary or primary schools) ----------

// Each phase is its own dataset, with its own modes, filters and popups. Switching reloads the page with
// `?phase=...`, so everything below is set up for one phase only. The URL decides, then the saved choice.
function readPhase(): Phase {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(PHASE_KEY);
  } catch {
    // storage unavailable
  }
  return choosePhase(new URLSearchParams(location.search), saved);
}
const PHASE = readPhase();
const hasPhaseInUrl = isPhase(new URLSearchParams(location.search).get('phase'));
const { MODES, FILTERS, EXTENSIONS, SOURCE_NOTES, modeById } = registryFor(PHASE);
/** Secondary keeps its original key, so saved settings survive; other phases have their own. */
const STORAGE_KEY = PHASE === DEFAULT_PHASE ? 'schools-map-settings' : `schools-map-settings-${PHASE}`;

const PHASE_TEXT: Record<Phase, { label: string; title: string; map: string; scope: (count: string) => string }> = {
  secondary: {
    label: 'Secondary',
    title: 'Secondary schools in England',
    map: 'Map of secondary schools',
    scope: (n) => `${n} open mainstream secondary schools with GCSE results.`,
  },
  primary: {
    label: 'Primary',
    title: 'Primary schools in England',
    map: 'Map of primary schools',
    scope: (n) => `${n} open state-funded mainstream primary schools. Independent schools aren't shown.`,
  },
};

function savePhase(phase: Phase): void {
  try {
    localStorage.setItem(PHASE_KEY, phase);
  } catch {
    // storage unavailable
  }
}

/** Shows the phase in the title and the switch, and turns the switch into a link-free reload to the other phase. */
function bindPhaseSwitch(): void {
  const text = PHASE_TEXT[PHASE];
  document.querySelector('.panel-title')!.textContent = text.title;
  $('map').setAttribute('aria-label', text.map);
  $('phase-switch').replaceChildren(
    ...PHASES.map((phase) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'radio';
      button.textContent = PHASE_TEXT[phase].label;
      button.setAttribute('aria-checked', String(phase === PHASE));
      button.addEventListener('click', () => {
        if (phase === PHASE) return;
        // A school, trust or shortlist from one phase means nothing in the other, so the new view starts clean
        savePhase(phase);
        location.assign(`${location.pathname}?phase=${phase}${location.hash}`);
      });
      return button;
    }),
  );
}

/** Current value of every filter, by filter id: a boolean for checkboxes, a string for selects and focus filters. */
type FilterValues = Record<string, boolean | string>;

interface Settings {
  mode: string;
  filters: FilterValues;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Settings (per-viewer convenience; the page works without storage) ----------

/** Focus filters (a trust, say) are set by a popup button or the URL, not saved and not listed under "Show". */
const CHIPS = FILTERS.filter((f): f is ChipFilter => f.control.kind === 'chip');
const isChip = (f: FilterDef): f is ChipFilter => f.control.kind === 'chip';

function filterDefaults(): FilterValues {
  return Object.fromEntries(FILTERS.map((f) => [f.id, f.default]));
}

/** A saved value is used only if it still suits the filter (right type, and a known option for selects). */
function validFilterValue(f: FilterDef, value: unknown): boolean {
  if (f.control.kind === 'checkbox') return typeof value === 'boolean';
  if (f.control.kind === 'chip') return false;
  return typeof value === 'string' && f.control.options.some((o) => o.value === value);
}

function loadSettings(): Settings {
  const defaults: Settings = { mode: MODES[0].id, filters: filterDefaults() };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as
      | { mode?: unknown; filters?: Record<string, unknown> }
      | null;
    const filters = filterDefaults();
    for (const f of FILTERS) {
      const value = saved?.filters?.[f.id];
      if (validFilterValue(f, value)) filters[f.id] = value as boolean | string;
    }
    return { mode: typeof saved?.mode === 'string' ? saved.mode : defaults.mode, filters };
  } catch {
    return defaults;
  }
}

function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: mode.id, filters: Object.fromEntries(Object.entries(activeFilters).filter(([id]) => !CHIPS.some((c) => c.id === id))) } satisfies Settings));
  } catch {
    // storage unavailable (private window etc.)
  }
}

// ---------- State ----------

// What the page shows (`mode`, `activeFilters`) can lag behind what the person picked
// (`wanted`, `filters`) while the columns for a new choice download. Everything drawn uses
// the first pair, so nothing is ever computed from a column that isn't loaded yet.
const settings = loadSettings();
let mode: ModeDef = modeById(settings.mode);
let wanted: ModeDef = mode;
const filters: FilterValues = settings.filters;
let activeFilters: FilterValues = { ...filters };
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let theme: Theme = darkQuery.matches ? 'dark' : 'light';

let data: SchoolData;
let shown: SchoolFeature[] = [];
/** Set once the first view is worked out. A style that loads earlier (a link with a focus filter fetches data first) must not draw dots from an empty view. */
let layersWanted = false;
let selectedUrn: number | null = null;

const isNarrow = () => window.matchMedia('(max-width: 720px)').matches;
/** True while the school popup is showing as a bottom sheet on a phone. */
let sheetOpen = false;
const mapPadding = () =>
  isNarrow()
    ? { top: 20, bottom: sheetOpen ? Math.round(window.innerHeight * 0.5) + 10 : 80, left: 20, right: 20 }
    : { top: 40, bottom: 40, left: 400, right: 40 };

function setSheetOpen(open: boolean): void {
  if (sheetOpen === open) return;
  sheetOpen = open;
  document.body.classList.toggle('popup-open', open);
  // Give the map back its room when the sheet goes away
  if (!open && map) map.easeTo({ padding: mapPadding(), duration: 200 });
}

const map = new maplibregl.Map({
  container: 'map',
  style: STYLES[theme],
  bounds: ENGLAND,
  fitBoundsOptions: { padding: mapPadding() },
  attributionControl: { compact: true },
  maxZoom: 17,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.GeolocateControl({ fitBoundsOptions: { maxZoom: 12 } }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

const hoverTip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'hover-tip', offset: 10 });
const detailPopup = new maplibregl.Popup({
  maxWidth: '340px',
  offset: 10,
  focusAfterOpen: false,
  // The built-in close-on-click runs after the dot's click handler, so it would close the popup just opened for a second
  // school. The map's click handler closes it instead, when the click is not on a dot.
  closeOnClick: false,
});
detailPopup.on('close', () => {
  setSelected(null);
  setSheetOpen(false);
});
let searchMarker: maplibregl.Marker | null = null;

// ---------- Filtering and map data ----------

/** A filter whose `enabledBy` checkbox is off is switched off along with it. */
function isSwitchedOff(f: FilterDef, values: FilterValues): boolean {
  return f.enabledBy !== undefined && !values[f.enabledBy];
}

/** The filter values that count: those of switched-off filters are left out. */
function inUse(values: FilterValues): FilterValues {
  return Object.fromEntries(FILTERS.filter((f) => !isSwitchedOff(f, values)).map((f) => [f.id, values[f.id]]));
}

function passesFilters(p: SchoolRecord): boolean {
  // Each test is typed for its own control kind, which the shared FilterValues record can't express
  return FILTERS.every((f) => isSwitchedOff(f, activeFilters) || (f.test as (p: SchoolRecord, value: boolean | string) => boolean)(p, activeFilters[f.id]));
}

/** Map features carry only what styling needs; popups look schools up by URN. */
function mapData(): FeatureCollection {
  const palette = mode.palette ?? 'diverging';
  return {
    type: 'FeatureCollection',
    features: shown.map((f) => {
      const bucket = mode.bucketOf(f.properties);
      const colour = bucket === null ? -1 : mode.buckets[bucket].colour;
      return {
        type: 'Feature',
        geometry: f.geometry,
        // Extremes draw on top so they aren't hidden under average schools
        properties: { urn: f.properties.urn, colour, sortKey: drawOrder(palette, colour) },
      };
    }),
  };
}

const notApplicableColour = () => (theme === 'dark' ? '#b9b8b0' : '#7a7973');

function colourExpression(): ExpressionSpecification {
  const p = PALETTES[mode.palette ?? 'diverging'][theme];
  // -2 is a bucket that does not apply (a school with no sixth form): a solid neutral dot, unlike the hollow "No data" ring
  return ['match', ['get', 'colour'], 0, p[0], 1, p[1], 2, p[2], 3, p[3], 4, p[4], -2, notApplicableColour(), 'rgba(0,0,0,0)'];
}

function strokeExpression(): ExpressionSpecification {
  const ring = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,20,0.55)';
  const empty = '#8a8983';
  return ['case', ['<', ['get', 'colour'], 0], empty, ring];
}

/** The map's two school layers (dots, and the ring round the open school), painted for the current theme. */
function schoolLayers(): LayerSpecification[] {
  return [
    {
      id: 'schools',
      type: 'circle',
      source: 'schools',
      layout: { 'circle-sort-key': ['get', 'sortKey'] },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 9, 5.5, 13, 9],
        'circle-color': colourExpression(),
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 12, 1.5],
        'circle-stroke-color': strokeExpression(),
      },
    },
    {
      id: 'schools-selected',
      type: 'circle',
      source: 'schools',
      filter: ['==', ['get', 'urn'], selectedUrn ?? -1],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 7, 9, 10, 13, 14],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': theme === 'dark' ? '#ffffff' : '#0b0b0b',
      },
    },
  ];
}

/**
 * Where our layers go in a basemap's layer list: above roads but beneath place names, so town labels stay
 * readable. Styles order their layers differently, so look for the first place-label layer.
 */
const firstLabelId = (layers: LayerSpecification[]) =>
  layers.find((l) => l.type === 'symbol' && 'source-layer' in l && l['source-layer'] === 'place')?.id;

function addLayers(): void {
  map.addSource('schools', { type: 'geojson', data: mapData() });
  const before = firstLabelId(map.getStyle().layers);
  for (const layer of schoolLayers()) map.addLayer(layer, before);
}

/**
 * Puts our dots into a new basemap style before it loads, so a theme switch swaps basemap and dots together
 * rather than showing the new basemap bare until `style.load` re-adds the layers.
 */
function withSchools(_previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!data) return next;
  const layers = [...next.layers];
  const at = layers.findIndex((l) => l.id === firstLabelId(layers));
  layers.splice(at < 0 ? layers.length : at, 0, ...schoolLayers());
  return { ...next, sources: { ...next.sources, schools: { type: 'geojson', data: mapData() } }, layers };
}

function applyColours(): void {
  if (!map.getLayer('schools')) return;
  map.setPaintProperty('schools', 'circle-color', colourExpression());
}

function setLoading(on: boolean, message = ''): void {
  $('legend').classList.toggle('loading', on);
  $('legend').setAttribute('aria-busy', String(on));
  $('view-status').textContent = on ? 'Loading…' : message;
}

let refreshes = 0;

/**
 * Applies the chosen mode and filters. A first-time choice needs its columns first: the old
 * view stays up (dimmed legend) until they arrive. If the person changes their mind meanwhile,
 * only the latest request is applied; if loading fails, the previous choices are put back.
 */
async function refresh(): Promise<void> {
  const mine = ++refreshes;
  const fields = data.viewFields(wanted.id, inUse(filters));
  if (!data.hasFields(fields)) {
    setLoading(true);
    try {
      await data.ensureFields(fields);
    } catch (err) {
      if (mine !== refreshes) return;
      console.error(err);
      wanted = mode;
      Object.assign(filters, activeFilters);
      renderModes();
      bindFilters();
      setLoading(false, err instanceof StaleDataError ? err.message : 'Couldn’t load that view. Check your connection and try again.');
      return;
    }
  }
  if (mine !== refreshes) return;
  setLoading(false);
  mode = wanted;
  activeFilters = { ...filters };
  applyColours();
  shown = data.features.filter((f) => passesFilters(f.properties));
  (map.getSource('schools') as GeoJSONSource | undefined)?.setData(mapData());
  renderLegendAndList();
  renderFocus();
  syncUrl();
  saveSettings();
}

function setSelected(urn: number | null): void {
  selectedUrn = urn;
  syncUrl();
  if (map.getLayer('schools-selected')) map.setFilter('schools-selected', ['==', ['get', 'urn'], urn ?? -1]);
}

/**
 * Fits the map to a set of schools (a trust, a shortlist...) so all of them are in view, leaving room for the panel.
 * A single school is flown to instead. Use it after changing what is shown.
 */
function fitToSchools(schools: SchoolFeature[]): void {
  if (schools.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const f of schools) bounds.extend(f.geometry.coordinates);
  map.fitBounds(bounds, { padding: mapPadding(), maxZoom: 13, duration: 800 });
}

/** The schools a focus filter selects, whatever the other filters say. */
const focusSet = (chip: ChipFilter, value: string) => data.features.filter((f) => chip.test(f.properties, value));

/** Completes a short link value (see `ChipFilter.resolve`), reading the school's detail shard if needed. */
async function resolveFocus(chip: ChipFilter, value: string): Promise<string> {
  if (!chip.resolve) return value;
  return chip.resolve(value, async (urn) => {
    if (!data.byUrn.has(urn)) return undefined;
    await data.getDetails(urn);
    return data.byUrn.get(urn)?.properties;
  });
}

/**
 * Turns a focus filter on (`value`) or off (''), then fits the map to its schools. A value that matches no school
 * (an old link) is ignored. Called by popup buttons (`h.filterButton`) and the chip's ✕.
 */
async function setFocus(chip: ChipFilter, value: string): Promise<void> {
  if (value) {
    value = await resolveFocus(chip, value);
    // The test reads fields that may not be loaded yet
    await data.ensureFields(data.viewFields(wanted.id, { [chip.id]: value }));
    if (focusSet(chip, value).length === 0) return;
    detailPopup.remove();
  }
  filters[chip.id] = value;
  await refresh();
  if (value && activeFilters[chip.id] === value) {
    fitToSchools(shown.filter((f) => chip.test(f.properties, value)));
    // On a phone the map is what was asked for: the chip stays visible in the folded panel
    if (isNarrow()) setPanelCollapsed(true);
  }
}

/** The chip and summary of each active focus filter, at the top of the panel. */
function renderFocus(): void {
  const container = $('focus');
  const blocks: HTMLElement[] = [];
  for (const chip of CHIPS) {
    const value = activeFilters[chip.id] as string;
    if (!value) continue;
    const schools = focusSet(chip, value);
    const records = schools.map((f) => f.properties);
    const block = document.createElement('div');
    block.className = 'focus-block';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'chip';
    clear.setAttribute('aria-label', `Clear ${chip.control.label.toLowerCase()} filter`);
    clear.textContent = `${chip.control.label}: ${chip.control.chipText(records, value)}  ✕`;
    clear.addEventListener('click', () => void setFocus(chip, ''));
    block.append(clear);
    const hidden = schools.length - shown.filter((f) => chip.test(f.properties, value)).length;
    if (hidden > 0) {
      const p = document.createElement('p');
      p.className = 'muted small';
      p.textContent = `${hidden.toLocaleString()} of these ${schools.length.toLocaleString()} schools are hidden by the other filters under “Show”.`;
      block.append(p);
    }
    const summary = chip.control.summary?.(records, value, h, data.core.metadata);
    if (summary) {
      const div = document.createElement('div');
      div.className = 'focus-summary';
      div.innerHTML = summary.value;
      block.append(div);
    }
    blocks.push(block);
  }
  container.replaceChildren(...blocks);
  container.hidden = blocks.length === 0;
}

/**
 * Keeps the address in step with the view so it can be shared: `?urn=<school>` for the open school and
 * `?<filter id>=<value>` for each focus filter (for example `?trust=17396`). Read again at start-up.
 */
function syncUrl(): void {
  if (!data) return;
  const params = new URLSearchParams(location.search);
  for (const chip of CHIPS) params.delete(chip.id);
  params.delete('urn');
  // Secondary is the default, so its links stay as they always were
  params.delete('phase');
  if (PHASE !== DEFAULT_PHASE) params.set('phase', PHASE);
  for (const chip of CHIPS) if (activeFilters[chip.id]) params.set(chip.id, chip.urlValue?.(activeFilters[chip.id] as string) ?? (activeFilters[chip.id] as string));
  if (selectedUrn !== null) params.set('urn', String(selectedUrn));
  // Commas stay readable in a shared link (?compare=1,2,3)
  const query = params.toString().replaceAll('%2C', ',');
  try {
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  } catch {
    // some embedded browsers refuse
  }
}

/** Opens the popup at once with the core fields, then fills in the rest when the school's shard arrives. */
function openSchool(urn: number, fly = false): void {
  const feature = data.byUrn.get(urn);
  if (!feature) return;
  const [lng, lat] = feature.geometry.coordinates;
  hoverTip.remove();
  if (fly) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 12), padding: mapPadding() });
  const render = (failed = false) =>
    popupHtml(feature.properties, { needs: data.core.needs.popup, ready: (f) => data.hasField(f, urn), failed, metadata: data.core.metadata, phase: PHASE });
  detailPopup.setLngLat([lng, lat]).setHTML(render()).addTo(map);
  setSelected(urn);
  if (isNarrow()) {
    // The popup is a bottom sheet on a phone: fold the panel away and keep the dot above the sheet
    setPanelCollapsed(true);
    setSheetOpen(true);
    if (!fly) map.easeTo({ center: [lng, lat], padding: mapPadding(), duration: 300 });
  }
  if (!data.hasDetails(urn)) {
    // Only redraw if this school's popup is still the one on screen
    // Setting the HTML replaces the scrolling element, so carry the scroll position over
    // and so does keyboard focus, which is found again by group, id or link/label
    const redraw = (markup: string) => {
      const root = detailPopup.getElement();
      const top = root?.querySelector('.school-popup')?.scrollTop ?? 0;
      const controls = (el: Element | null) => [...(el?.querySelectorAll<HTMLElement>('summary, a[href], button, input, select, textarea, [tabindex]') ?? [])];
      const active = document.activeElement;
      let focus: ((el: Element | null) => HTMLElement | null | undefined) | null = null;
      if (active instanceof HTMLElement && root?.contains(active)) {
        const group = active.closest<HTMLElement>('details[data-group]')?.dataset.group;
        if (active.tagName === 'SUMMARY' && group) {
          focus = (el) => el?.querySelector<HTMLElement>(`details[data-group="${CSS.escape(group)}"] > summary`);
        } else if (active.id) {
          focus = (el) => el?.querySelector<HTMLElement>(`#${CSS.escape(active.id)}`);
        } else {
          // Anything else: the same link or same-labelled control. No match leaves focus alone rather than guessing.
          const href = active.getAttribute('href');
          const label = active.textContent?.trim();
          focus = (el) => controls(el).find((c) => c.tagName === active.tagName && (href ? c.getAttribute('href') === href : c.textContent?.trim() === label));
        }
      }
      detailPopup.setHTML(markup);
      const next = detailPopup.getElement()?.querySelector('.school-popup');
      if (next) next.scrollTop = top;
      // preventScroll: the scroll position was just restored
      focus?.(detailPopup.getElement())?.focus({ preventScroll: true });
    };
    const update = (failed: boolean) => selectedUrn === urn && detailPopup.isOpen() && redraw(render(failed));
    data.getDetails(urn).then(
      () => update(false),
      (err: unknown) => {
        console.error(err);
        update(true);
      },
    );
  }
}

// ---------- Panel rendering ----------

function renderModes(): void {
  const container = $('modes');
  container.replaceChildren(
    ...MODES.map((m) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'radio';
      button.textContent = m.label;
      button.setAttribute('aria-checked', String(m.id === wanted.id));
      button.addEventListener('click', () => {
        wanted = m;
        renderModes();
        void refresh();
      });
      return button;
    }),
  );
  const { description } = wanted;
  $('mode-description').textContent = typeof description === 'string' ? description : description(data.core.metadata);
}

function swatch(colour: number): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = colour === -1 ? 'swatch empty' : colour === -2 ? 'swatch na' : 'swatch';
  if (colour >= 0) el.style.background = PALETTES[mode.palette ?? 'diverging'][theme][colour];
  if (colour === -2) el.style.background = notApplicableColour();
  return el;
}

function inView(): SchoolFeature[] {
  const bounds = map.getBounds();
  return shown.filter((f) => bounds.contains(f.geometry.coordinates));
}

function renderLegendAndList(): void {
  const visible = inView();

  const counts = new Array<number>(mode.buckets.length).fill(0);
  let noData = 0;
  for (const f of visible) {
    const b = mode.bucketOf(f.properties);
    if (b === null) noData++;
    else counts[b]++;
  }
  const legendItems = mode.buckets.map((bucket, i) => {
    const li = document.createElement('li');
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = counts[i].toLocaleString();
    li.append(swatch(bucket.colour), bucket.label, count);
    return li;
  });
  const none = document.createElement('li');
  const noneCount = document.createElement('span');
  noneCount.className = 'count';
  noneCount.textContent = noData.toLocaleString();
  none.append(swatch(-1), 'No data', noneCount);
  $('legend').replaceChildren(...legendItems, none);

  const ranked = visible
    .filter((f) => mode.sortValue(f.properties) !== null)
    .sort((a, b) => mode.sortValue(b.properties)! - mode.sortValue(a.properties)!);

  $('list-heading').textContent = `Schools in view by ${mode.label}`;
  $('list-caption').textContent =
    visible.length === 0
      ? 'No schools in view. Zoom out or change the filters.'
      : `${visible.length.toLocaleString()} in view${ranked.length > LIST_LIMIT ? `, top ${LIST_LIMIT} shown` : ''}. ` +
        'Small differences are rarely meaningful.';

  $('school-list').replaceChildren(
    ...ranked.slice(0, LIST_LIMIT).map((f, i) => {
      const p = f.properties;
      const bucket = mode.bucketOf(p);
      const li = document.createElement('li');
      li.tabIndex = 0;
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.name;
      name.title = `${p.name}, ${p.town ?? p.la}`;
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = mode.formatValue(p);
      li.append(rank, swatch(bucket === null ? -1 : mode.buckets[bucket].colour), name, value);
      const open = () => openSchool(p.urn, true);
      li.addEventListener('click', open);
      li.addEventListener('keydown', (e) => e.key === 'Enter' && open());
      return li;
    }),
  );
}

function renderAbout(): void {
  const { metadata } = data.core;
  const built = new Date(metadata.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const sourceLink = (key: string, label: string) =>
    metadata.sources[key] ? h.html`<a href="${metadata.sources[key]}" target="_blank" rel="noopener">${label}</a>` : h.html`${label}`;
  const items = SOURCE_NOTES.map((n) => n.about?.(metadata, { ...h, sourceLink }) ?? null)
    .filter((item) => item !== null)
    .map((item) => `<li>${item.value}</li>`)
    .join('\n      ');
  $('about').innerHTML = `
    <p>${PHASE_TEXT[PHASE].scope(data.core.count.toLocaleString())} Built ${built}.</p>
    <ul>
      ${items}
    </ul>`;

  $('data-dates').textContent = SOURCE_NOTES.flatMap((n) => n.dates?.(metadata) ?? [])
    .filter(Boolean)
    .join(' · ');
}

// ---------- Filters UI ----------

/** Builds the "Show" controls from the registered filters, with the grouped ones in collapsible sections. */
function bindFilters(): void {
  const LISTED = FILTERS.filter((f): f is Exclude<FilterDef, ChipFilter> => !isChip(f));
  const container = $('filters');
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const counters = new Map<FilterGroupId, () => void>();
  /** Greys out filters whose checkbox is off. */
  const syncEnabled = () => {
    for (const f of LISTED) {
      const control = controls.get(f.id)!;
      control.disabled = isSwitchedOff(f, filters);
      control.closest('label')?.classList.toggle('disabled', control.disabled);
    }
    for (const update of counters.values()) update();
  };
  const build = (f: (typeof LISTED)[number]) => {
    const label = document.createElement('label');
    if (f.control.kind === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = filters[f.id] as boolean;
      input.addEventListener('change', () => {
        filters[f.id] = input.checked;
        syncEnabled();
        void refresh();
      });
      controls.set(f.id, input);
      label.append(input, ` ${f.control.label}`);
    } else {
      label.className = f.enabledBy ? 'select-label dependent' : 'select-label';
      const select = document.createElement('select');
      for (const o of f.control.options) select.append(new Option(o.label, o.value));
      select.value = filters[f.id] as string;
      select.addEventListener('change', () => {
        filters[f.id] = select.value;
        syncEnabled();
        void refresh();
      });
      controls.set(f.id, select);
      label.append(`${f.control.label} `, select);
    }
    return label;
  };

  const loose = LISTED.filter((f) => !f.group);
  const nodes: HTMLElement[] = [];
  if (loose.length) {
    const grid = document.createElement('div');
    grid.className = 'filter-grid';
    grid.append(...loose.map(build));
    nodes.push(grid);
  }
  // Groups appear in the order of their first filter
  const groupIds = [...new Set(LISTED.flatMap((f) => (f.group ? [f.group] : [])))];
  for (const id of groupIds) {
    const members = LISTED.filter((f) => f.group === id);
    const def: { label: string; open?: boolean } = FILTER_GROUPS[id];
    const details = document.createElement('details');
    details.className = 'filter-group';
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.textContent = def.label;
    const count = document.createElement('span');
    count.className = 'filter-count';
    summary.append(title, count);
    const grid = document.createElement('div');
    grid.className = 'filter-grid';
    grid.append(...members.map(build));
    details.append(summary, grid);
    // Open by default for the main group, and whenever one of its filters is in use
    const inUseCount = () => members.filter((f) => !isSwitchedOff(f, filters) && filters[f.id] !== f.default).length;
    details.open = !!def.open || inUseCount() > 0;
    counters.set(id, () => {
      const n = inUseCount();
      count.textContent = n ? `${n} on` : '';
    });
    nodes.push(details);
  }
  container.replaceChildren(...nodes);
  syncEnabled();
}

// ---------- Search: school names locally, postcodes via postcodes.io ----------

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

async function lookupPostcode(query: string): Promise<[number, number] | null> {
  const q = query.replace(/\s+/g, '');
  const url = FULL_POSTCODE.test(q)
    ? `https://api.postcodes.io/postcodes/${encodeURIComponent(q)}`
    : `https://api.postcodes.io/outcodes/${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: { longitude: number | null; latitude: number | null } };
  const { longitude, latitude } = body.result ?? {};
  return longitude != null && latitude != null ? [longitude, latitude] : null;
}

function bindSearch(): void {
  const input = $<HTMLInputElement>('search');
  const results = $<HTMLUListElement>('search-results');
  const status = $('search-status');
  let matches: SchoolFeature[] = [];
  let active = -1;

  const close = () => {
    results.hidden = true;
    active = -1;
  };

  const render = () => {
    results.replaceChildren(
      ...matches.map((f, i) => {
        const li = document.createElement('li');
        li.role = 'option';
        li.setAttribute('aria-selected', String(i === active));
        li.textContent = `${f.properties.name}, ${f.properties.town ?? f.properties.la}`;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(f);
        });
        return li;
      }),
    );
    results.hidden = matches.length === 0;
  };

  const choose = (f: SchoolFeature) => {
    input.value = f.properties.name;
    close();
    if (!passesFilters(f.properties)) status.textContent = 'This school is hidden by your filters.';
    openSchool(f.properties.urn, true);
  };

  const goToPostcode = async (query: string) => {
    status.textContent = 'Looking up postcode…';
    try {
      const lngLat = await lookupPostcode(query);
      if (!lngLat) {
        status.textContent = 'Postcode not found.';
        return;
      }
      status.textContent = '';
      searchMarker?.remove();
      searchMarker = new maplibregl.Marker({ color: '#0b0b0b', scale: 0.7 }).setLngLat(lngLat).addTo(map);
      map.flyTo({ center: lngLat, zoom: OUTCODE.test(query.trim()) ? 12 : 13, padding: mapPadding() });
      if (isNarrow()) setPanelCollapsed(true);
    } catch {
      status.textContent = 'Postcode lookup failed. Check your connection.';
    }
  };

  input.addEventListener('input', () => {
    status.textContent = '';
    const q = input.value.trim().toLowerCase();
    matches =
      q.length < 3
        ? []
        : data.features.filter((f) => f.properties.name.toLowerCase().includes(q)).slice(0, 8);
    active = -1;
    render();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length === 0) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      render();
    } else if (e.key === 'Enter') {
      const q = input.value.trim();
      if (active >= 0) choose(matches[active]);
      else if (FULL_POSTCODE.test(q.replace(/\s+/g, '')) || OUTCODE.test(q)) {
        close();
        void goToPostcode(q);
      } else if (matches.length === 1) choose(matches[0]);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  input.addEventListener('blur', close);
}

// ---------- Mobile bottom sheet ----------

function setPanelCollapsed(collapsed: boolean): void {
  $('panel').classList.toggle('collapsed', collapsed);
  $('panel-toggle').setAttribute('aria-expanded', String(!collapsed));
}

$('panel-toggle').addEventListener('click', () => {
  if (isNarrow()) setPanelCollapsed(!$('panel').classList.contains('collapsed'));
});

// ---------- Popup buttons ----------

// A button made with h.filterButton(id, value, label) turns a focus filter on. Popups are rebuilt as data
// arrives, so one listener on the document handles every popup.
document.addEventListener('click', (e) => {
  const button = (e.target as Element).closest<HTMLElement>('[data-set-filter]');
  const chip = CHIPS.find((c) => c.id === button?.dataset.setFilter);
  if (button && chip && button.dataset.value) {
    const failed = () => ($('view-status').textContent = 'Couldn’t load that view. Check your connection and try again.');
    setFocus(chip, button.dataset.value).catch(failed);
  }
});

// ---------- Map interaction ----------

function bindMapEvents(): void {
  map.on('mousemove', 'schools', (e: MapLayerMouseEvent) => {
    const urn = e.features?.[0]?.properties.urn as number | undefined;
    const feature = urn !== undefined ? data.byUrn.get(urn) : undefined;
    if (!feature) return;
    map.getCanvas().style.cursor = 'pointer';
    if (urn === selectedUrn && detailPopup.isOpen()) return;
    const p = feature.properties;
    const el = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = p.name;
    el.append(strong, document.createElement('br'), `${mode.label}: ${mode.formatValue(p)}`);
    hoverTip.setLngLat(feature.geometry.coordinates).setDOMContent(el).addTo(map);
  });

  map.on('mouseleave', 'schools', () => {
    map.getCanvas().style.cursor = '';
    hoverTip.remove();
  });

  map.on('click', 'schools', (e: MapLayerMouseEvent) => {
    const urn = e.features?.[0]?.properties.urn as number | undefined;
    if (urn !== undefined) openSchool(urn);
  });

  // A click on empty map closes the popup (a click on a dot is handled above, and replaces it)
  map.on('click', (e) => {
    if (!detailPopup.isOpen()) return;
    if (map.queryRenderedFeatures(e.point, { layers: ['schools'] }).length === 0) detailPopup.remove();
  });

  map.on('moveend', renderLegendAndList);

  // The basemap styles name a few icons their sprites lack; a blank one stops a console warning for each
  map.on('styleimagemissing', (e) => {
    if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });

  // Basemap follows the OS theme; setStyle drops our layers, so re-add them on load
  map.on('style.load', () => {
    if (layersWanted && !map.getSource('schools')) addLayers();
  });
  darkQuery.addEventListener('change', (e) => {
    theme = e.matches ? 'dark' : 'light';
    map.setStyle(STYLES[theme], { transformStyle: withSchools });
    renderLegendAndList();
  });
}

// ---------- Extensions (features with their own interface, such as the shortlist comparison) ----------

function startExtensions(): void {
  const app: AppApi = {
    data,
    addPanelSection: (element) => $('focus').after(element),
    openSchool,
    setFocus: (filterId, value) => {
      const chip = CHIPS.find((c) => c.id === filterId);
      return chip ? setFocus(chip, value) : Promise.reject(new Error(`no focus filter "${filterId}"`));
    },
    focusValue: (filterId) => (activeFilters[filterId] as string | undefined) ?? '',
    isNarrow,
    collapsePanel: () => setPanelCollapsed(true),
    phase: PHASE,
  };
  for (const extension of EXTENSIONS) {
    // One extension failing must not stop the map
    Promise.resolve(extension.start(app)).catch((err: unknown) => console.error(`extension ${extension.id}:`, err));
  }
}

// ---------- Startup ----------

async function main(): Promise<void> {
  bindMapEvents();
  bindPhaseSwitch();
  bindAbout();
  if (hasPhaseInUrl) savePhase(PHASE);
  data = await loadCore(PHASE);
  // A link can carry a focus filter (?trust=17396) and a school (?urn=100049)
  const params = new URLSearchParams(location.search);
  for (const chip of CHIPS) {
    const value = params.get(chip.id);
    if (value) filters[chip.id] = await resolveFocus(chip, value).catch(() => value);
  }
  // A saved mode or filter needs its columns before the first draw
  await data.ensureFields(data.viewFields(mode.id, inUse(filters)));
  for (const chip of CHIPS) if (filters[chip.id] && focusSet(chip, filters[chip.id] as string).length === 0) filters[chip.id] = '';
  activeFilters = { ...filters };
  shown = data.features.filter((f) => passesFilters(f.properties));

  renderAbout();
  renderModes();
  bindFilters();
  bindSearch();
  if (isNarrow()) setPanelCollapsed(true);

  layersWanted = true;
  if (map.isStyleLoaded()) addLayers();
  else map.once('load', () => !map.getSource('schools') && addLayers());
  renderLegendAndList();
  renderFocus();
  // Rewrites an old long link in its short form
  syncUrl();

  startExtensions();

  const urn = Number(params.get('urn'));
  // A link to a school from the other phase (made before the phase was in the address) opens in that phase
  if (urn && !data.byUrn.has(urn) && !hasPhaseInUrl && (await inOtherPhase(urn, params))) return;
  const focused = CHIPS.filter((c) => activeFilters[c.id]);
  if (urn && data.byUrn.has(urn)) openSchool(urn, true);
  else if (focused.length) fitToSchools(shown.filter((f) => focused.some((c) => c.test(f.properties, activeFilters[c.id] as string))));
}

/** If this school is in the other phase's data, goes there (keeping the link's own parameters) and returns true. */
async function inOtherPhase(urn: number, linkParams: URLSearchParams): Promise<boolean> {
  const other = PHASES.find((p) => p !== PHASE)!;
  try {
    const { byUrn } = await loadCore(other);
    if (!byUrn.has(urn)) return false;
    // The link's own parameters, as it came: syncUrl() has already taken ?urn= out of the address bar
    const params = new URLSearchParams(linkParams);
    params.set('phase', other);
    location.replace(`${location.pathname}?${params.toString().replaceAll('%2C', ',')}${location.hash}`);
    return true;
  } catch {
    return false;
  }
}

// End-to-end tests (e2e/) set `__E2E__` before the page loads and then read the map and the drawn count through this.
// Nothing in the page uses it, and without the flag it is never created.
if ((window as { __E2E__?: boolean }).__E2E__) Object.assign(window, { __explorer: { map, shownCount: () => shown.length } });

main().catch((err: unknown) => {
  console.error(err);
  $('view-status').textContent = err instanceof Error ? err.message : String(err);
});
