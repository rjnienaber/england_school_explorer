# Secondary School Map

An interactive map of England's secondary schools, coloured by GCSE results, Progress 8 or
Ofsted outcome. It is built from open government data and published as a static site:
plain HTML, JS and one GeoJSON file, with no server or API keys.

Version 2 (2026) replaces the 2021 data-prep scripts (`to_sqlite.sh`, `src/optimize.ts`,
and a Google Maps front end that was never committed) with a reproducible TypeScript
pipeline and a MapLibre front end. The old pipeline is preserved in commit `3a964e2`.

## Quick start

Needs Node 24 or newer (it runs `.ts` files natively, so there is no compile step for scripts).

```bash
npm install
npm start            # fetch → build → serve at http://localhost:8080
```

Or run the steps separately:

| Command | What it does |
| --- | --- |
| `npm run fetch` | Downloads the three source files into `data/` (about 180 MB). Skips files already there; `-- --force` re-downloads. Records URLs in `data/sources.json`. |
| `npm run build:data` | Joins the sources and writes `dist/schools.geojson` (about 5 MB, about 30 s). |
| `npm run build:web` | Bundles `web/` with esbuild into `dist/app.js` and `dist/app.css`, and copies `index.html` and MapLibre's worker files. |
| `npm run build` | Both build steps. |
| `npm run watch` | Rebuilds the web bundle on change. |
| `npm run serve` | Serves `dist/` locally (`PORT` to override 8080). |
| `npm run typecheck` | `tsc` over the Node scripts and the browser code. |

To publish, upload `dist/` to any static host (for example GitHub Pages, Cloudflare Pages
or DreamHost). Source maps (`*.map`) are optional.

## Data sources

All are published under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

| Source | Used for | Notes |
| --- | --- | --- |
| [DfE key stage 4 performance](https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance), institution-level data set on Explore Education Statistics | Attainment 8, Progress 8 with confidence intervals, English and maths grade 5+, EBacc entry, cohort size, % disadvantaged | Three years per file (currently 2022/23 to 2024/25). `z` and `c` mark missing or suppressed values. The older compare-school-performance download blocks scripted access. |
| [Get Information About Schools](https://get-information-schools.service.gov.uk/) daily extract (`edubasealldataYYYYMMDD.csv`) | Location, type, status, age range, gender, sixth form, admissions policy, religion, trust, website | Windows-1252. Gives British National Grid easting/northing, which are converted to WGS84 with `proj4`. |
| [Ofsted monthly management information](https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes): state-funded schools, latest inspections | Inspection outcomes | Windows-1252. The latest file is found through the GOV.UK content API. Doesn't cover independent schools (most are inspected by the ISI). |

Basemap: [OpenFreeMap](https://openfreemap.org/) vector tiles (OpenStreetMap data), with Positron for light mode and Dark for dark mode.
Postcode search: [postcodes.io](https://postcodes.io/).

## Architecture

```
scripts/
  fetch.ts          download sources → data/
  build-data.ts     join + score → dist/schools.geojson
  build-web.ts      esbuild bundle → dist/
  serve.ts          local static server
  paths.ts
  lib/
    csv.ts          streaming CSV reader with encoding support
    ks4.ts          KS4 performance loader (per school, per year)
    gias.ts         register loader + BNG → lat/lng
    ofsted.ts       inspection loader; handles three Ofsted frameworks
    stats.ts        percentiles, linear fit, Progress 8 bands
shared/
  school.ts         SchoolProperties: the GeoJSON contract between build and browser
web/
  index.html, style.css
  main.ts           map, filters, list, search
  modes.ts          colour modes, legend buckets, palette
  popup.ts          school detail popup
```

In scope: open, mainstream secondary schools in England with a KS4 entry (state-funded and
independent). Special schools, alternative provision and closed schools are excluded.

The browser loads the whole GeoJSON once, filters in memory, and gives MapLibre a slim
copy that holds only a colour index per school. Popups look the full record up by URN.

## How schools are compared

The map offers four "colour by" modes. None of them is a single "best school" score, by design.

**Progress 8** (official). Measures pupils' progress from KS2 to GCSE against pupils
nationally with the same starting point. Schools are banded the way DfE does it: a school is
above or below average only if its whole 95% confidence interval is. "Well above" or "well
below" also needs the score to be at least ±0.5. The popup shows the interval. About 28%
of intervals cross zero, so many apparent differences are noise. P8 isn't published for
2024/25 or 2025/26 because those cohorts had no KS2 tests during COVID, so the latest is
2023/24.

**Results vs intake** (our own estimate). Attainment 8 minus the score predicted from the
cohort's share of disadvantaged pupils. The prediction is a straight-line fit across
non-selective state schools, fitted for each year: currently Att8 ≈ 53.3 − 0.26 × %
disadvantaged, r = −0.50. Shown as a percentile among state schools. This is a rough,
contextual measure that covers years without P8. Grammar schools score highly because
their intake is selected on prior attainment, which the model doesn't see.

**Attainment 8**. The raw average GCSE points across eight subjects, as a percentile among
state schools. It is the most stable measure year to year (r = 0.97), but it mostly
reflects intake. Independent schools are shown but not ranked: many take IGCSEs, which
don't count, so some top schools score near zero.

**Ofsted**. The latest inspection, summarised to four levels:

- *Report cards* (since November 2025) grade each area on five points. The summary is
  "serious" if safeguarding is Not met or any area is Urgent improvement, "concern" if any
  area Needs attention, and "top" if at least half the areas are Strong or Exceptional.
  Otherwise it is "good". This is our simplification. The popup shows every area.
- *Graded inspections* (2019 to 2025 framework) map 1 to 4 onto the four levels. From
  September 2024 there's no overall grade, so quality of education is used.
- *Short (ungraded) inspections* give "School remains Good/Outstanding" when no graded
  inspection is in the current data.
- A school in special measures or with serious weaknesses is always "serious".

The list of schools in view ranks by the current mode. Differences between neighbouring
schools in the list are usually not meaningful.

## Caveats

- Data is a snapshot. Rerun `fetch` and `build` to refresh. Ofsted publishes monthly, GIAS
  daily, and KS4 results annually (revised data in spring).
- Small cohorts make every measure noisy. DfE suppresses the smallest.
- The map shows where schools are, not who can get in. Admissions depend on catchment,
  faith and selection criteria. Check the local authority's allocation data.
- Ofsted grades can be many years old. The popup shows the inspection date.

## Licence

Code: MIT. Data: Open Government Licence v3.0 (DfE, Ofsted). Map data © OpenStreetMap contributors.
