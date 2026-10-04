# England School Explorer

An interactive map of England's secondary schools, coloured by GCSE results, Progress 8 or
Ofsted outcome. It is built from open government data and published as a static site:
plain HTML, JS and one GeoJSON file, with no server or API keys.

It covers England only. Wales, Scotland and Northern Ireland publish school results on different
measures (Wales: Capped 9 on My Local School; Scotland: SQA qualifications of school leavers on
Parentzone; Northern Ireland: no official school-level tables), with no Progress 8 equivalent and
no Ofsted, so they can't share this map's colour scales. The project was called
`uk_schools_performance` until October 2026.

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
| `npm run fetch` | Downloads the sources into `data/`, keeping only the rows and columns the modules read (about 34 MB kept; about 170 MB transferred with `--force`, most of it the GIAS and Ofsted files, which can't be filtered on the server). Skips files already there; `-- --force` re-downloads. Records URLs in `data/sources.json` and prints what each source cost; in GitHub Actions the same table goes to the run summary. |
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

Live at **https://rjnienaber.github.io/england_school_explorer/** via GitHub Pages.
`.github/workflows/deploy.yml` downloads fresh data, builds and publishes the site:

- on every push to `master`;
- monthly, on the 10th, to pick up Ofsted's monthly update (and the yearly KS4 results
  when they appear). This run also publishes the dataset release;
- on demand: Actions → Deploy → Run workflow (also publishes the release; a re-run in the
  same month replaces that month's files).

The monthly and manual deploys download fresh data (`fetch --force`); a deploy on a push restores the `data/` cache (keyed by month and the hash of every `source.ts`) and downloads only what is missing, which is nothing when the cache exists. Pull requests run `.github/workflows/ci.yml`
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
| [Get Information About Schools: daily extract of every establishment](https://get-information-schools.service.gov.uk/), Department for Education (OGL v3) | Location, type, pupils on roll, capacity, status, age range, gender, sixth form, admissions policy, religion, religious ethos and diocese, trust, website, SEN units and resourced provision, urban or rural area, boarding schools, opening date and reason | Updated daily. Windows-1252. Only open establishments and the columns the modules read are kept (the extract is about 65 MB; about 10 MB is stored). Gives British National Grid easting/northing, which are converted to WGS84 with `proj4`. |
| [DfE pupil absence in schools in England, absence rates by school](https://explore-education-statistics.service.gov.uk/find-statistics/pupil-absence-in-schools-in-england), Department for Education (OGL v3) | Overall, unauthorised, persistent (10%+ of sessions) and severe (50%+) absence rates, with pupil numbers | Updated annually (full academic year, published in the spring). All academic years since 2013/14 in one file (about 120 MB), currently to 2024/25; only the latest year is used. The download is filtered as it arrives: only the latest year, State-funded secondary rows and the columns read are stored. State-funded schools only. Missing values are suppressed (`x`). |
| [DfE Schools, pupils and their characteristics (January school census), school level](https://explore-education-statistics.service.gov.uk/find-statistics/school-pupils-and-their-characteristics), Department for Education (OGL v3) | Pupils on roll, free school meals eligibility and pupils with English as an additional language, whole school | Updated annually (January census, published in June). The full file is 2.8 GB (every school of every phase, with ethnicity, age and year-group breakdowns), so only the rows used are fetched through the DfE statistics API (about 1 MB): state-funded secondary and independent schools, whole-school totals. The latest census only. Percentages are suppressed (`x`) where numbers are very small. There is no school-level SEN data in the open DfE statistics (the Special educational needs in England data sets stop at local authority level), so SEN is not shown. |
| [English Indices of Deprivation 2025: all ranks, scores and deciles for each small area (LSOA)](https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025), Ministry of Housing, Communities and Local Government (OGL v3) | Area deprivation (income deprivation affecting children, IDACI) of the neighbourhood each school is in | Updated every few years (previous edition 2019). About 10 MB, of which three columns are kept. Joined to schools through the LSOA (2021) code in the school register. England only. |
| [DfE key stage 4 destination measures, institution level](https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-destination-measures), Department for Education (OGL v3) | Where Year 11 leavers went next: school sixth form, sixth form college, FE college, apprenticeship, work | Updated annually (about two years behind: leavers of year X are published around October of X+2). Several leaver years in one file (about 38 MB), currently 2020/21 to 2022/23; only the latest is used, and only the all-pupils rows (the download is filtered to those as it arrives). Small cohorts are suppressed (`c`). |
| [DfE suspensions and permanent exclusions in England, school level](https://explore-education-statistics.service.gov.uk/find-statistics/suspensions-and-permanent-exclusions-in-england), Department for Education (OGL v3) | Suspension rate, pupils suspended at least once and permanent exclusions, with pupil numbers | Updated annually (full academic year, published in the summer, a year behind). All academic years since 2006/07 in one file (about 85 MB), currently to 2024/25; only the latest year is used. The download is filtered as it arrives and stopped once the latest year has been read (the file lists the newest year first). State-funded schools only. Rates are suppressed (`x`) for schools with no pupils on roll. |
| [DfE key stage 4 performance, institution-level data set](https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance), Department for Education (OGL v3) | Attainment 8, Progress 8 with confidence intervals, English and maths grade 5+ and 4+, average English and maths grades, Progress 8 by subject area, value added in science, humanities and languages, EBacc entry, cohort size, % disadvantaged | Updated annually (provisional in autumn, revised in spring). Three years per file (currently 2022/23 to 2024/25); all three are kept. The catalogue file is 96 MB (156 columns, a row for every pupil group), so only the rows and columns the modules read are fetched through the DfE statistics API (a few MB): the whole-school total plus the sex, disadvantage, first-language and prior-attainment groups. The API has no establishment type group (the catalogue CSV has), so the register (GIAS) decides which schools are special. `z` and `c` mark missing or suppressed values. The older compare-school-performance download blocks scripted access. |
| [DfE key stage 4 performance, subject entries at school level](https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance), Department for Education (OGL v3) | Which GCSE subjects each school entered pupils for (languages, computer science, separate sciences, music, art, drama, statistics, further maths) and how many pupils | Updated annually (provisional in autumn, revised in spring). The full file lists every grade of every qualification for every school (hundreds of MB), so only the total GCSE entries per school and subject are fetched through the DfE statistics API, latest year only. Entries are divided by pupils at the end of key stage 4, so a share can exceed 100% and is capped. `z`, `c` and `x` mark suppressed values. |
| [Ofsted monthly management information: state-funded schools, latest inspections](https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes), Ofsted (OGL v3) | Inspection outcomes | Updated monthly. Windows-1252. Only the columns read are kept (17 MB downloaded, under 5 MB stored). The latest file is found through the GOV.UK content API. Doesn't cover independent schools (most are inspected by the ISI). |
| [DfE A level and other 16 to 18 results, schools and colleges](https://explore-education-statistics.service.gov.uk/find-statistics/a-level-and-other-16-to-18-results), Department for Education (OGL v3) | Sixth form results: average A level grade, best three A levels, AAB share, value added and retention | Updated annually (final results are published each January or February; a revised-results release follows in the autumn). Four years in one file (about 59 MB), and every exam cohort and disadvantage group; only the latest year and the all-students A level rows are used, so only those rows and the columns read are fetched through the DfE statistics API (well under 1 MB). Suppressed values are `c`, not applicable `z`. |
| [DfE School workforce in England: size of the school workforce, school level (November census)](https://explore-education-statistics.service.gov.uk/find-statistics/school-workforce-in-england), Department for Education (OGL v3) | Teachers (full-time equivalent) and teachers without qualified teacher status, for pupil-teacher ratios | Updated annually (November census, published in June). The full file (143 MB) holds every year since 2010/11; the newest year is first, so only that part is downloaded. Numbers are rounded by the DfE and `x` means suppressed. The publication has no school-level pupil-teacher ratio, so the ratio is our own calculation. |
| [DfE School workforce in England: teacher sickness absence, school level](https://explore-education-statistics.service.gov.uk/find-statistics/school-workforce-in-england), Department for Education (OGL v3) | Days of sickness absence per teacher, and the share of teachers with any absence | Updated annually (a year behind the workforce size figures). Full file is 60 MB with every year since 2009/10; only the newest year (currently one year older than the workforce size file) is downloaded. |
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
| `dist/data/details/<n>.json` | every non-core field for ~32 schools (`urn % 128 == n`) | when a popup in that shard opens |

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
| [`schools.csv`](https://github.com/rjnienaber/england_school_explorer/releases/latest/download/schools.csv) | Spreadsheets. One row per school, the latest value of every field. UTF-8 with a BOM, so Excel shows accents correctly. |
| [`england_schools.sqlite`](https://github.com/rjnienaber/england_school_explorer/releases/latest/download/england_schools.sqlite) | SQL, Datasette, DuckDB, pandas. Same data, plus the long-format tables. |
| [`fields.csv`](https://github.com/rjnienaber/england_school_explorer/releases/latest/download/fields.csv) | The data dictionary: every column with its label, description, type, unit, year field, source, and the number of schools that have a value. |
| [`sources.csv`](https://github.com/rjnienaber/england_school_explorer/releases/latest/download/sources.csv) | Each source: publisher, download URL, when it was fetched, licence. |

The SQLite file holds:

- `schools`: one row per school (`urn`, `lng`, `lat`, `sector`, `selective`);
- `dim_<module>`: one table per dimension, one column per field, keyed by `urn`;
- `dim_<module>__<name>`: long-format tables where a school has several rows (for example
  `dim_ks4-headline__history`, one row per school and year);
- `wide`: a view joining every `dim_*` table, with exactly the columns of `schools.csv`;
- `fields` and `sources`: the two dictionaries above, as tables.

```bash
sqlite3 england_schools.sqlite 'select name, att8, p8 from wide where la = "Camden" order by p8 desc limit 5'
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

The map offers seven "colour by" modes. None of them is a single "best school" score, by design.

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

**How full** (official figures, our own ratio). Pupils on roll divided by the capacity recorded
in the school register, in five bands from under 70% to over 105%. DfE publishes no
applications or offers per school, so this is the nearest available measure of popularity. It
isn't good or bad in itself, so it uses a single-colour scale instead of the red-blue one.
Capacity figures can be old and include the sixth form where there is one, independent schools
report their own, and a full school isn't always oversubscribed: it may be full of pupils
placed there because other schools were full. Nearly a quarter of schools are over capacity.

**Absence** (official figures, our own ranking). The share of pupils who are persistently absent,
meaning they missed 10% or more of their possible sessions (about one day in ten) in the latest
full year (2024/25), as a percentile among state schools, lowest absence first. It has a good
end and a bad end, so it uses the red-blue scale. The popup also shows overall and severe (50% or
more missed) absence, each beside the median secondary school, and the number of pupils the rates
are based on. Absence is closely linked to disadvantage, just as raw GCSE results are, so compare
schools with similar intakes. DfE publishes it for state-funded schools only; independent
schools have no figures.

**Behaviour: suspensions and permanent exclusions** (official figures, popup only). The popup shows
suspensions per 100 pupils, the share of pupils suspended at least once and the number of permanent
exclusions in the latest full year (2024/25), each beside the median state secondary, with the number of
pupils the rates are based on. There is no map colour for it: one pupil can be suspended many times, small
schools swing a lot from one or two cases, and a higher rate is not simply worse, since schools differ in
how they use suspension. A figure DfE suppresses is left out. Independent schools have no figures.

**Pupils: free school meals and English as an additional language** (official figures, popup only). The popup
shows the number of pupils, the share eligible for free school meals and the share whose first language is
not English, each beside the median state secondary, from the January 2026 school census. These cover the
whole school, unlike the GCSE-year English as an additional language figure further down. They describe the
intake, not quality, so there is no map colour. DfE publishes no school-level figures for special educational
needs (its SEN data sets stop at local authority level), so SEN is not shown. Independent schools have a
pupil count only. The full DfE file is about 2.8 GB, so the fetch asks the DfE statistics API for just the rows used (about 2 MB).

**Staff: teachers, pupils per teacher and sickness** (official figures, popup only). The popup shows full-time-equivalent
teachers, pupils per teacher, the share of teachers without qualified teacher status, the share working part time, days of
sickness absence per teacher and the share of teachers with any sickness absence, each beside the median state secondary
(workforce census November 2025, sickness 2024/25). DfE publishes no school-level pupil-teacher ratio, so **pupils per teacher is
our own calculation**: pupils on roll (January census) divided by full-time-equivalent teachers. It is usually a little higher than
the DfE national figure, which uses full-time-equivalent pupils and qualified teachers only. Not shown on the map: a low ratio can
simply mean a small school, and some academies employ able teachers who lack qualified teacher status. State-funded schools only. The two
DfE files are 143 MB and 60 MB with every year since 2010, but they list the newest year first, so the fetch stops reading after it
(about 3 MB downloaded in a few seconds).

**After GCSEs: where pupils go next** (official figures, popup only). The popup shows the share of Year 11
leavers who stayed in education, an apprenticeship or work (the DfE "sustained destination" measure),
split into school sixth form, sixth form college, further education college, apprenticeship and work, each
beside the median state secondary, with the number of leavers. It is the 2022/23 leavers: destinations are
measured the following year and published about two years later. There is no map colour for it: where
pupils go depends on the post-16 courses nearby (a school with no sixth form sends everyone elsewhere) and
on the intake as much as on the school. The rest of each cohort has an unknown destination; small cohorts
are suppressed. DfE covers state-funded mainstream schools only.

**Sixth form: A level results and progress** (official figures; popup and the "Sixth form progress" map
colour). For schools with A level students the popup shows the average A level grade, the average grade of
each student's best three A levels, the share with AAB or better and the share who stayed to the end of their
courses (retention), each beside the median state secondary, plus DfE's A level value added with its 95%
confidence interval. It is the 2024/25 results. The map colour uses DfE's own value-added bands (a school is
above or below average only if its whole interval is) on the red-blue scale. Schools without a sixth form are
shown in plain grey as "No sixth form", separate from the hollow "No data" ring used for schools that have a
sixth form but too few students or no published figure. Value added compares students with others who had the
same GCSE results, so it partly allows for intake, but sixth forms differ a lot in size and entry
requirements. Small sixth forms swing by a few points on one student; a figure DfE suppresses is left out.
Only the A level results are used, not applied general or technical courses.

**SEN units and resourced provision** (filter and popup, from the school register). Tick "Has an SEN
unit or resourced provision" to keep only schools that run one (about 690 of the 4,150), then
optionally pick a "Type of need" such as autism, speech and language, or hearing impairment. The
need box is greyed out until the tick box is on. The popup lists the needs the school says it
caters for and the number of places where the register gives one. The register is filled in by
schools and may lag behind, not every school with provision lists its needs, and a unit does not
mean a place is available. Check the local authority's "local offer" and ask the school.

**Urban or rural** (filter and popup, from the school register). The "Area" box keeps only urban
or only rural schools (about 3,570 urban and 580 rural of the 4,150). The register classifies each
school's location into six categories (Urban, Larger rural and Smaller rural, each nearer to or
further from a major town or city), based on the ONS 2011 rural-urban classification; we group
them into urban and rural, and the popup shows the original category under the school's name.
It describes the area, not the school, and the classification dates from the 2011 census.

**Area deprivation** (filter and popup, from the English Indices of Deprivation 2025). The "Area
deprivation" box keeps schools whose neighbourhood is in one fifth of England: the most deprived
fifth through to the least deprived fifth. We use the Income Deprivation Affecting Children Index
(IDACI): the share of children in income-deprived families in the school's neighbourhood (an LSOA,
about 1,500 people), ranked against all 33,755 neighbourhoods in England. The register gives each
school's LSOA, so no postcode lookup is needed; the one extra download is the IoD 2025 "File 7"
(about 10 MB). The popup shows the fifth and the decile (1 is the most deprived tenth). It describes the area around the school, not its pupils, who may live
elsewhere, and it covers independent schools as well. Ofsted's own file carries a quintile too, but
from an older edition (it disagrees with 2025 for more than a third of schools), so we use the
2025 data. The values are in the data as `idaciDecile` and `idaciScorePct` (the raw rate, not shown because the 2025 edition counts more
families as income deprived than 2019, so rank is the safer comparison), ready for other measures.

**Boarding schools** (filter and popup tag, from the school register). The "Boarding schools only"
box keeps the 314 schools the register lists as boarding schools, and the popup shows a "Boarding"
tag. Most are independent schools, with a few state boarding schools. Only the register's
"Boarding school" value counts: children's homes and college residential places are left out, and a
school with a blank entry is treated as not boarding. The register may be out of date, and it does
not say how many pupils board or whether day pupils are taken.

**Faith schools** (filter and popup tags, from the school register). The "Faith schools" filter
keeps either the 1,079 schools with a religious character, or an ethos naming a faith, or everything
else. The popup tag shows the religious character with the diocese where there is one ("Roman
Catholic · Archdiocese of Westminster", 495 schools), and a second "Christian ethos" style tag only
when the register's ethos says something the character does not (it mostly repeats it). A blank
register entry counts as non-faith, and an "inter- or non-denominational" ethos is not treated as a
faith. The grouping is ours, not an official label.

**Opening date** (popup line, from the school register). Under the school's name the popup says
"Opened Sept 2023 (new school)" for a genuinely new school (a new provision or free school) that
opened in the last five years (88 schools), and, when such a school has no Attainment 8 score, adds
that new schools have no GCSE results until their first pupils reach Year 11. An academy conversion
shows "Became an academy in 2015" (1,553 schools), which also explains an Ofsted inspection of a
predecessor school. Amalgamations, fresh starts and older new schools show nothing. We group the
register's "reason opened" ourselves: for a conversion the date is when it became an academy, not
when the school was founded, and many older schools have no date.

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

**GCSE subjects** (popup and a filter, official figures). A "Subjects" section naming the main GCSE
subjects the school entered pupils for (every language the DfE lists, computer science, biology,
chemistry, physics, statistics, music, art, drama and a few more) as a share of the year group,
beside the median state school that enters the subject and the share of state schools that do. The
"Offers GCSE" filter keeps schools entering a chosen language (or any language), computer science,
statistics, further maths, music, drama or art; schools with no figures are hidden while it is on.
These are entries, not results, and a pupil taking a subject early or again can push a share up (it
stops at 100%). There is no GCSE in further maths, so that row is the Level 3 free-standing maths
qualification. Small community-language entries (Polish, Urdu...) are real but often a handful of pupils.

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
