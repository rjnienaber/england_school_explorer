import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { SchoolCollection, SchoolFeature, SchoolProperties } from '../shared/school.ts';
import { MODES, PALETTE, modeById, type Mode, type Theme } from './modes.ts';
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

interface Filters {
  state: boolean;
  independent: boolean;
  selective: boolean;
  sixthForm: boolean;
  gender: string;
}

interface Settings {
  mode: string;
  filters: Filters;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Settings (per-viewer convenience; the page works without storage) ----------

function loadSettings(): Settings {
  const defaults: Settings = {
    mode: 'p8',
    filters: { state: true, independent: false, selective: true, sixthForm: false, gender: '' },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Settings> | null;
    return { mode: saved?.mode ?? defaults.mode, filters: { ...defaults.filters, ...saved?.filters } };
  } catch {
    return defaults;
  }
}

function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: mode.id, filters } satisfies Settings));
  } catch {
    // storage unavailable (private window etc.)
  }
}

// ---------- State ----------

const settings = loadSettings();
let mode: Mode = modeById(settings.mode);
const filters: Filters = settings.filters;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let theme: Theme = darkQuery.matches ? 'dark' : 'light';

let collection: SchoolCollection;
const byUrn = new Map<number, SchoolFeature>();
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

function passesFilters(p: SchoolProperties): boolean {
  if (p.sector === 'state' && !filters.state) return false;
  if (p.sector === 'independent' && !filters.independent) return false;
  if (p.selective && !filters.selective) return false;
  if (filters.sixthForm && !p.sixthForm) return false;
  if (filters.gender && p.gender !== filters.gender) return false;
  return true;
}

/** Map features carry only what styling needs; popups look schools up by URN. */
function mapData(): FeatureCollection {
  const middle = 2;
  return {
    type: 'FeatureCollection',
    features: shown.map((f) => {
      const bucket = mode.bucketOf(f.properties);
      const colour = bucket === null ? -1 : mode.buckets[bucket].colour;
      return {
        type: 'Feature',
        geometry: f.geometry,
        // Extremes draw on top so they aren't hidden under average schools
        properties: { urn: f.properties.urn, colour, sortKey: colour < 0 ? -1 : Math.abs(colour - middle) },
      };
    }),
  };
}

function colourExpression(): ExpressionSpecification {
  const p = PALETTE[theme];
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

function refresh(): void {
  shown = collection.features.filter((f) => passesFilters(f.properties));
  (map.getSource('schools') as GeoJSONSource | undefined)?.setData(mapData());
  renderLegendAndList();
  saveSettings();
}

function setSelected(urn: number | null): void {
  selectedUrn = urn;
  if (map.getLayer('schools-selected')) map.setFilter('schools-selected', ['==', ['get', 'urn'], urn ?? -1]);
}

function openSchool(urn: number, fly = false): void {
  const feature = byUrn.get(urn);
  if (!feature) return;
  const [lng, lat] = feature.geometry.coordinates;
  hoverTip.remove();
  if (fly) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 12), padding: mapPadding() });
  detailPopup.setLngLat([lng, lat]).setHTML(popupHtml(feature.properties)).addTo(map);
  setSelected(urn);
  if (isNarrow()) setPanelCollapsed(true);
}

// ---------- Panel rendering ----------

function renderModes(): void {
  const container = $('modes');
  container.replaceChildren(
    ...MODES.map((m) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'radio';
      button.textContent = m.name;
      button.setAttribute('aria-checked', String(m.id === mode.id));
      button.addEventListener('click', () => {
        mode = m;
        renderModes();
        refresh();
      });
      return button;
    }),
  );
  const latestKs4 = collection.metadata.ks4Years[0] ?? null;
  $('mode-description').textContent = mode.description({ p8Year: collection.metadata.p8Year, ks4Year: latestKs4 });
}

function swatch(colour: number): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = colour < 0 ? 'swatch empty' : 'swatch';
  if (colour >= 0) el.style.background = PALETTE[theme][colour];
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

  $('list-heading').textContent = `Schools in view by ${mode.name}`;
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
  const { metadata } = collection;
  const built = new Date(metadata.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const link = (key: string, label: string) =>
    metadata.sources[key] ? `<a href="${metadata.sources[key]}" target="_blank" rel="noopener">${label}</a>` : label;
  $('about').innerHTML = `
    <p>${collection.features.length.toLocaleString()} open mainstream secondary schools with GCSE results. Built ${built}.</p>
    <ul>
      <li>${link('ks4', 'DfE key stage 4 performance')} (${metadata.ks4Years.join(', ')})</li>
      <li>${link('gias', 'Get Information About Schools')} register (locations and school details)</li>
      <li>${link('ofsted', 'Ofsted management information')}${metadata.ofstedAsAt ? ` as at ${metadata.ofstedAsAt}` : ''}</li>
    </ul>
    <p>Contains public sector information licensed under the Open Government Licence v3.0.</p>
    <p><strong>Read with care.</strong> Special schools and alternative provision aren't shown. Results for small year groups
    are noisy. Living near a school doesn't mean getting a place there: check the admissions criteria and how far
    places went last year with the local authority.</p>`;

  const ks4 = metadata.ks4Years[0];
  $('data-dates').textContent = [
    ks4 && `GCSEs ${ks4}`,
    metadata.p8Year && `Progress 8 ${metadata.p8Year}`,
    metadata.ofstedAsAt && `Ofsted to ${metadata.ofstedAsAt}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------- Filters UI ----------

function bindFilters(): void {
  const checkboxes: [string, keyof Omit<Filters, 'gender'>][] = [
    ['f-state', 'state'],
    ['f-independent', 'independent'],
    ['f-selective', 'selective'],
    ['f-sixth', 'sixthForm'],
  ];
  for (const [id, key] of checkboxes) {
    const input = $<HTMLInputElement>(id);
    input.checked = filters[key];
    input.addEventListener('change', () => {
      filters[key] = input.checked;
      refresh();
    });
  }
  const gender = $<HTMLSelectElement>('f-gender');
  gender.value = filters.gender;
  gender.addEventListener('change', () => {
    filters.gender = gender.value;
    refresh();
  });
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
        : collection.features.filter((f) => f.properties.name.toLowerCase().includes(q)).slice(0, 8);
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
    const feature = urn !== undefined ? byUrn.get(urn) : undefined;
    if (!feature) return;
    map.getCanvas().style.cursor = 'pointer';
    if (urn === selectedUrn && detailPopup.isOpen()) return;
    const p = feature.properties;
    const el = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = p.name;
    el.append(strong, document.createElement('br'), `${mode.name}: ${mode.formatValue(p)}`);
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
    if (collection) addLayers();
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
  const res = await fetch('schools.geojson');
  if (!res.ok) throw new Error(`Couldn't load schools.geojson (${res.status}). Run npm run build first.`);
  collection = (await res.json()) as SchoolCollection;
  for (const f of collection.features) byUrn.set(f.properties.urn, f);
  shown = collection.features.filter((f) => passesFilters(f.properties));

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
