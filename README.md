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
| `npm run generate` | Writes the generated browser types and registry, and this README's sources table, from `dimensions/`. The build and typecheck run it for you. |
| `npm run build:data` | Builds the store from the sources and writes the site's data to `dist/data/` (about 110 KB gzipped to start, 3 MB in all, about 45 s), checks it against the store, and writes `dist/data/manifest.json` with every file's size. |
| `npm run build:web` | Bundles `web/` with esbuild into `dist/app.js` and `dist/app.css`, and copies `index.html` and MapLibre's worker files. |
| `npm run build` | Both build steps. |
| `npm run build:release` | Both build steps without sourcemaps, as used by the deploy. |
| `npm run watch` | Rebuilds the web bundle on change. |
| `npm run serve` | Serves `dist/` locally (`PORT` to override 8080). |
| `npm run typecheck` | Generates, then `tsc` over the Node code and the browser code. |
| `npm test` | Runs every `test.ts` with `node --test`. Module tests build from small committed fixtures (`dimensions/<id>/fixtures/`), so they need no `data/`. |
| `npm run export-release` | After `build:data`, writes the downloadable dataset to `release/` (see "Download the data"). `-- --month 2026-10` names the month; `-- --previous-fields <fields.csv>` lists fields added or removed since an earlier release. |
| `npm run check-budgets` | After a build, checks `dist/` against the size budgets in `budgets.json` and prints a table. Fails when one is exceeded. |

To publish, upload `dist/` to any static host (for example GitHub Pages, Cloudflare Pages
or DreamHost). Source maps (`*.map`) are optional.

## Deployment

Live at **https://rjnienaber.github.io/uk_schools_performance/** via GitHub Pages.
`.github/workflows/deploy.yml` downloads fresh data, builds and publishes the site:

- on every push to `master`;
- monthly, on the 10th, to pick up Ofsted's monthly update (and the yearly KS4 results
  when they appear). This run also publishes the dataset release;
- on demand: Actions → Deploy → Run workflow (also publishes the release; a re-run in the
  same month replaces that month's files).

Deploys always download fresh data (`fetch --force`). Pull requests run `.github/workflows/ci.yml`
(typecheck, tests, build, size budgets); it caches `data/` per month and per set of
`source.ts` files, using the copy the last deploy saved, so a warm run downloads nothing.
Raising a budget in `budgets.json` is a deliberate change: explain it in the pull request.

Nothing is committed back to the repo: `data/` and `dist/` are rebuilt on every run. The
build fails (and the live site stays as it was) if fewer than 3,500 schools come out,
which usually means a source changed format.

## Data sources

All are published under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

<!-- sources:start (generated from dimensions/*/source.ts by `npm run generate`; do not edit) -->
| Source | Used for | Notes |
| --- | --- | --- |
| [Get Information About Schools: daily extract of every establishment](https://get-information-schools.service.gov.uk/), Department for Education (OGL v3) | Location, type, status, age range, gender, sixth form, admissions policy, religion, trust, website | Updated daily. Windows-1252. Gives British National Grid easting/northing, which are converted to WGS84 with `proj4`. |
| [DfE key stage 4 performance, institution-level data set](https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance), Department for Education (OGL v3) | Attainment 8, Progress 8 with confidence intervals, English and maths grade 5+ and 4+, average English and maths grades, Progress 8 by subject area, value added in science, humanities and languages, EBacc entry, cohort size, % disadvantaged | Updated annually (provisional in autumn, revised in spring). Three years per file (currently 2022/23 to 2024/25). `z` and `c` mark missing or suppressed values. The older compare-school-performance download blocks scripted access. |
| [Ofsted monthly management information: state-funded schools, latest inspections](https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes), Ofsted (OGL v3) | Inspection outcomes | Updated monthly. Windows-1252. The latest file is found through the GOV.UK content API. Doesn't cover independent schools (most are inspected by the ISI). |
<!-- sources:end -->

Basemap: [OpenFreeMap](https://openfreemap.org/) vector tiles (OpenStreetMap data), with Positron for light mode and Dark for dark mode.
Postcode search: [postcodes.io](https://postcodes.io/).

## Architecture

```
dimensions/<id>/      one folder per kind of data; the only place a new dimension touches
  source.ts           where the data comes from (URL, licence, notes): feeds fetch and the table above
  build.ts            declares the fields and turns the source into rows
  web.ts              colour modes, filters, popup sections, About text
  test.ts             tests for this module
  fixtures/           a few rows of each source, so tests run without data/
lib/                  the framework: module types, build store, pipeline, generators
scripts/              thin runners: fetch, generate, build-data, build-web, export-release, serve, diff-geojson, verify-data
web/                  the browser shell: map, list, search, popup framework, toolkit, palettes
  generated/          git-ignored; written by `npm run generate`
docs/adding-a-dimension.md   the guide for adding a dimension
```

Each dimension is self-contained. `npm run build:data` builds the modules in dependency order
into a SQLite store (`build/schools.sqlite`, git-ignored), checks every row against the declared
fields, then exports `dist/data/` (see below). `npm run generate` writes the browser's record type
and module list from the folders, so adding a dimension means adding a folder and editing no
other file. See [docs/adding-a-dimension.md](docs/adding-a-dimension.md).

The current dimensions are `gias-core` (the schools themselves), `ks4-headline`, `intake-model`
and `ofsted`.

In scope: open, mainstream secondary schools in England with a KS4 entry (state-funded and
independent). Special schools, alternative provision and closed schools are excluded.

The data is split so a visit downloads only what it uses (`lib/columnar.ts` describes the format):

| File | Holds | Loaded |
| --- | --- | --- |
| `dist/data/core.json` | every school's id, position and `core` fields as columns (about 110 KB gzipped) | at start |
| `dist/data/modes/<field>.json` | one `mode` field for every school | first time a mode or filter reads it |
| `dist/data/details/<n>.json` | every non-core field for ~65 schools (`urn % 64 == n`) | when a popup in that shard opens |

Which fields a mode, filter or popup section reads is found at build time by running them over
every school (`lib/trace-needs.ts`), so modules declare nothing beyond each field's `placement`.
Files are requested with `?v=<buildId>` and each carries that id, so a deploy can't mix old and
new files; a mismatch reloads the page once. The browser filters in memory and gives MapLibre a
slim copy that holds only a colour index per school. The full dataset for reuse is published
monthly as a GitHub Release (next section), not from the site.

## Download the data

The joined, cleaned dataset (every school on the map, with every field) is published as a GitHub
Release each month, tagged `data-YYYY-MM`. These links always give the newest:

| File | For |
| --- | --- |
| [`schools.csv`](https://github.com/rjnienaber/uk_schools_performance/releases/latest/download/schools.csv) | Spreadsheets. One row per school, the latest value of every field. UTF-8 with a BOM, so Excel shows accents correctly. |
| [`uk_schools.sqlite`](https://github.com/rjnienaber/uk_schools_performance/releases/latest/download/uk_schools.sqlite) | SQL, Datasette, DuckDB, pandas. Same data, plus the long-format tables. |
| [`fields.csv`](https://github.com/rjnienaber/uk_schools_performance/releases/latest/download/fields.csv) | The data dictionary: every column with its label, description, type, unit, year field, source, and the number of schools that have a value. |
| [`sources.csv`](https://github.com/rjnienaber/uk_schools_performance/releases/latest/download/sources.csv) | Each source: publisher, download URL, when it was fetched, licence. |

The SQLite file holds:

- `schools`: one row per school (`urn`, `lng`, `lat`, `sector`, `selective`);
- `dim_<module>`: one table per dimension, one column per field, keyed by `urn`;
- `dim_<module>__<name>`: long-format tables where a school has several rows (for example
  `dim_ks4-headline__history`, one row per school and year);
- `wide`: a view joining every `dim_*` table, with exactly the columns of `schools.csv`;
- `fields` and `sources`: the two dictionaries above, as tables.

```bash
sqlite3 uk_schools.sqlite 'select name, att8, p8 from wide where la = "Camden" order by p8 desc limit 5'
duckdb -c "select count(*) from 'schools.csv'"
```

Empty (CSV) or NULL (SQLite) means "no value": the school has none, or DfE suppressed it. The
original suppression codes (`c`, `z`, `x`, `low`) are not kept. Percentiles and "vs intake"
figures are our own estimates, as described below. The files hold no personal data: GIAS head
teacher names and telephone numbers are never read, and the export refuses to run (and a test
fails) if any column looks like one.

Contains public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
(Department for Education and Ofsted; sources in the table above). Cite them, and this
repository, when you reuse it.

## How schools are compared

The map offers five "colour by" modes. None of them is a single "best school" score, by design.

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

**Disadvantaged pupils** (our own ranking of official figures). The Attainment 8 score of
disadvantaged pupils only (free school meals at any time in the last 6 years, or looked after),
as a percentile among state schools. It partly allows for intake and shows how well a school
does for pupils who often start behind. Schools with fewer than 10 disadvantaged pupils are not
ranked: their averages swing too much. The popup also shows other pupils' score and the gap, but
colour does not use the gap: a small gap can just mean other pupils do badly. Independent
schools have no data.

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

**Results by starting point** (popup only, official figures). Attainment 8 and Progress 8 for
pupils who were low, middle or high attainers at the end of primary school, so a parent can
see how children like theirs do. Bands use the same confidence-interval rule as Progress 8.
It needs KS2 results, so it shows 2023/24 (the latest with data) even where the GCSE results
are newer, and groups of a few pupils are noisy or hidden when suppressed.

**Boys and girls** (popup only, official figures). One row in the GCSE results: Attainment 8
for boys and for girls, with pupil numbers. Only mixed schools with at least 10 boys and 10
girls in the year group; single-sex schools show nothing. Small groups swing a lot from year
to year, so treat differences of a point or two as noise.

**English as an additional language** (popup only, official figures). One row in the GCSE
results: the share of the year group whose first language is known or believed to be other
than English, and their Attainment 8. Shown only with at least 10 such pupils. There is no
published figure for English-speaking pupils, so compare with the school's overall score.

**Grade 4+ pass rates** (popup only, official figures). Rows in the GCSE results next to the
grade 5+ English and maths figure: English and maths at grade 4+ (a standard pass, the usual
resit and sixth-form threshold), 5+ GCSEs at grade 4+ including English and maths (DfE's "5+ level 2
passes including English and maths", the old headline), and the EBacc achieved at grade 4+ and 5+.
All are shares of the whole year group, not just those entering. Independent schools often show 0%
or low figures because IGCSEs don't count.

**English and maths grades** (popup only, derived from official figures). One row in the GCSE
results: the average grade (1-9) in English and in maths across the year group. DfE publishes each
as Attainment 8 points over two slots (English and maths are double-weighted), so we halve them to
get a grade; English and maths plus the EBacc and open slots add up to the Attainment 8 score.
Independent and special schools often have no figure, because IGCSEs don't count and a published
0 means "no counted results", which we treat as missing.

**Curriculum** (popup and a filter, official figures). A "Curriculum" section with the share of
the year group entered for triple science, a language, more than one language, and history or
geography, plus GCSE entries per pupil. These are entries, not results, and independent schools
often differ because of IGCSEs. The "Most pupils take triple science" filter keeps schools where
at least half the year group is entered; schools with no published figure are hidden while it is on.

The list of schools in view ranks by the current mode. Differences between neighbouring
schools in the list are usually not meaningful.

## Caveats

- Data is a snapshot. Rerun `fetch` and `build` to refresh. Ofsted publishes monthly, GIAS
  daily, and KS4 results annually (revised data in spring).
- Small cohorts make every measure noisy. DfE suppresses the smallest.
- The map shows where schools are, not who can get in. Admissions depend on catchment,
  faith and selection criteria. Check the local authority's allocation data.
- Ofsted grades can be many years old. The popup shows the inspection date.
- Each popup ends with "More information" links built from the URN: DfE's school performance tables, the
  GIAS register entry and, for state-funded schools only (independent schools have no data there), the
  Financial Benchmarking and Insights Tool. They are plain links and are not checked at build time.

## Licence

Code: MIT. Data: Open Government Licence v3.0 (DfE, Ofsted). Map data © OpenStreetMap contributors.
