import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { SchoolFeature, SchoolRecord } from './types.ts';
import { loadCore, StaleDataError, type SchoolData } from './data.ts';
import { drawOrder, PALETTES, type Theme } from './palette.ts';
import { FILTERS, MODES, SOURCE_NOTES, modeById } from './registry.ts';
import { h, type FilterDef, type ModeDef } from './toolkit.ts';
import { popupHtml } from './popup.ts';
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
const STORAGE_KEY = 'schools-map-settings';

/** Current value of every filter, by filter id: a boolean for checkboxes, a string for selects. */
type FilterValues = Record<string, boolean | string>;

interface Settings {
  mode: string;
  filters: FilterValues;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Settings (per-viewer convenience; the page works without storage) ----------

function filterDefaults(): FilterValues {
  return Object.fromEntries(FILTERS.map((f) => [f.id, f.default]));
}

/** A saved value is used only if it still suits the filter (right type, and a known option for selects). */
function validFilterValue(f: FilterDef, value: unknown): boolean {
  if (f.control.kind === 'checkbox') return typeof value === 'boolean';
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: mode.id, filters: activeFilters } satisfies Settings));
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
let selectedUrn: number | null = null;

const isNarrow = () => window.matchMedia('(max-width: 720px)').matches;
const mapPadding = () =>
  isNarrow() ? { top: 20, bottom: 80, left: 20, right: 20 } : { top: 40, bottom: 40, left: 400, right: 40 };

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
const detailPopup = new maplibregl.Popup({ maxWidth: '340px', offset: 10, focusAfterOpen: false });
detailPopup.on('close', () => setSelected(null));
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

function colourExpression(): ExpressionSpecification {
  const p = PALETTES[mode.palette ?? 'diverging'][theme];
  return ['match', ['get', 'colour'], 0, p[0], 1, p[1], 2, p[2], 3, p[3], 4, p[4], 'rgba(0,0,0,0)'];
}

function strokeExpression(): ExpressionSpecification {
  const ring = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,20,0.55)';
  const empty = '#8a8983';
  return ['case', ['==', ['get', 'colour'], -1], empty, ring];
}

function addLayers(): void {
  map.addSource('schools', { type: 'geojson', data: mapData() });
  // Draw schools above roads but beneath place names, so town labels stay readable.
  // Styles order their layers differently, so look for the first place-label layer.
  const firstLabel = map
    .getStyle()
    .layers.find((l) => l.type === 'symbol' && 'source-layer' in l && l['source-layer'] === 'place')?.id;
  map.addLayer({
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
  }, firstLabel);
  map.addLayer({
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
  }, firstLabel);
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
  saveSettings();
}

function setSelected(urn: number | null): void {
  selectedUrn = urn;
  if (map.getLayer('schools-selected')) map.setFilter('schools-selected', ['==', ['get', 'urn'], urn ?? -1]);
}

/** Opens the popup at once with the core fields, then fills in the rest when the school's shard arrives. */
function openSchool(urn: number, fly = false): void {
  const feature = data.byUrn.get(urn);
  if (!feature) return;
  const [lng, lat] = feature.geometry.coordinates;
  hoverTip.remove();
  if (fly) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 12), padding: mapPadding() });
  const render = (failed = false) =>
    popupHtml(feature.properties, { needs: data.core.needs.popup, ready: (f) => data.hasField(f, urn), failed, metadata: data.core.metadata });
  detailPopup.setLngLat([lng, lat]).setHTML(render()).addTo(map);
  setSelected(urn);
  if (isNarrow()) setPanelCollapsed(true);
  if (!data.hasDetails(urn)) {
    // Only redraw if this school's popup is still the one on screen
    const update = (failed: boolean) => selectedUrn === urn && detailPopup.isOpen() && detailPopup.setHTML(render(failed));
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
  el.className = colour < 0 ? 'swatch empty' : 'swatch';
  if (colour >= 0) el.style.background = PALETTES[mode.palette ?? 'diverging'][theme][colour];
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
    <p>${data.core.count.toLocaleString()} open mainstream secondary schools with GCSE results. Built ${built}.</p>
    <ul>
      ${items}
    </ul>
    <p>Contains public sector information licensed under the Open Government Licence v3.0.</p>
    <p><strong>Read with care.</strong> Special schools and alternative provision aren't shown. Results for small year groups
    are noisy. Living near a school doesn't mean getting a place there: check the admissions criteria and how far
    places went last year with the local authority.</p>`;

  $('data-dates').textContent = SOURCE_NOTES.flatMap((n) => n.dates?.(metadata) ?? [])
    .filter(Boolean)
    .join(' · ');
}

// ---------- Filters UI ----------

/** Builds the "Show" controls from the registered filters. */
function bindFilters(): void {
  const container = $('filters');
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  /** Greys out filters whose checkbox is off. */
  const syncEnabled = () => {
    for (const f of FILTERS) {
      const control = controls.get(f.id)!;
      control.disabled = isSwitchedOff(f, filters);
      control.closest('label')?.classList.toggle('disabled', control.disabled);
    }
  };
  container.replaceChildren(
    ...FILTERS.map((f) => {
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
          void refresh();
        });
        controls.set(f.id, select);
        label.append(`${f.control.label} `, select);
      }
      return label;
    }),
  );
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

  map.on('moveend', renderLegendAndList);

  // Basemap follows the OS theme; setStyle drops our layers, so re-add them on load
  map.on('style.load', () => {
    if (data) addLayers();
  });
  darkQuery.addEventListener('change', (e) => {
    theme = e.matches ? 'dark' : 'light';
    map.setStyle(STYLES[theme]);
    renderLegendAndList();
  });
}

// ---------- Startup ----------

async function main(): Promise<void> {
  bindMapEvents();
  data = await loadCore();
  // A saved mode or filter needs its columns before the first draw
  await data.ensureFields(data.viewFields(mode.id, inUse(filters)));
  shown = data.features.filter((f) => passesFilters(f.properties));

  renderAbout();
  renderModes();
  bindFilters();
  bindSearch();
  if (isNarrow()) setPanelCollapsed(true);

  if (map.isStyleLoaded()) addLayers();
  else map.once('load', () => !map.getSource('schools') && addLayers());
  renderLegendAndList();
}

main().catch((err: unknown) => {
  console.error(err);
  $('data-dates').textContent = err instanceof Error ? err.message : String(err);
});
