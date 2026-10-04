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
| [Get Information About Schools: daily extract of every establishment](https://get-information-schools.service.gov.uk/), Department for Education (OGL v3) | Location, type, pupils on roll, capacity, status, age range, gender, sixth form, admissions policy, religion, religious ethos and diocese, trust (name and code), website, SEN units and resourced provision, urban or rural area, boarding schools, opening date and reason | Updated daily. Windows-1252. Only open establishments and the columns the modules read are kept (the extract is about 65 MB; about 10 MB is stored). Gives British National Grid easting/northing, which are converted to WGS84 with `proj4`. |
| [DfE pupil absence in schools in England, absence rates by school](https://explore-education-statistics.service.gov.uk/find-statistics/pupil-absence-in-schools-in-england), Department for Education (OGL v3) | Overall, unauthorised, persistent (10%+ of sessions) and severe (50%+) absence rates, with pupil numbers | Updated annually (full academic year, published in the spring). All academic years since 2013/14 in one file (about 120 MB), currently to 2024/25; only the latest year is used. The download is filtered as it arrives: only the latest year, State-funded secondary rows and the columns read are stored. State-funded schools only. Missing values are suppressed (`x`). |
| [DfE Schools, pupils and their characteristics (January school census), school level](https://explore-education-statistics.service.gov.uk/find-statistics/school-pupils-and-their-characteristics), Department for Education (OGL v3) | Pupils on roll, free school meals eligibility and pupils with English as an additional language, whole school (the latter also feeds the expected score in Results vs intake) | Updated annually (January census, published in June). The full file is 2.8 GB (every school of every phase, with ethnicity, age and year-group breakdowns), so only the rows used are fetched through the DfE statistics API (about 1 MB): state-funded secondary and independent schools, whole-school totals. The latest census only. Percentages are suppressed (`x`) where numbers are very small. There is no school-level SEN data in the open DfE statistics (the Special educational needs in England data sets stop at local authority level), so SEN is not shown. |
| [English Indices of Deprivation 2025: all ranks, scores and deciles for each small area (LSOA)](https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025), Ministry of Housing, Communities and Local Government (OGL v3) | Area deprivation (income deprivation affecting children, IDACI) of the neighbourhood each school is in | Updated every few years (previous edition 2019). About 10 MB, of which three columns are kept. Joined to schools through the LSOA (2021) code in the school register. England only. |
| [DfE key stage 4 destination measures, institution level](https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-destination-measures), Department for Education (OGL v3) | Where Year 11 leavers went next: school sixth form, sixth form college, FE college, apprenticeship, work | Updated annually (about two years behind: leavers of year X are published around October of X+2). Several leaver years in one file (about 38 MB), currently 2020/21 to 2022/23; only the latest is used, and only the all-pupils rows (the download is filtered to those as it arrives). Small cohorts are suppressed (`c`). |
| [DfE suspensions and permanent exclusions in England, school level](https://explore-education-statistics.service.gov.uk/find-statistics/suspensions-and-permanent-exclusions-in-england), Department for Education (OGL v3) | Suspension rate, pupils suspended at least once and permanent exclusions, with pupil numbers | Updated annually (full academic year, published in the summer, a year behind). All academic years since 2006/07 in one file (about 85 MB), currently to 2024/25; only the latest year is used. The download is filtered as it arrives and stopped once the latest year has been read (the file lists the newest year first). State-funded schools only. Rates are suppressed (`x`) for schools with no pupils on roll. |
| [DfE key stage 4 performance, institution-level data set](https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance), Department for Education (OGL v3) | Attainment 8, Progress 8 with confidence intervals, English and maths grade 5+ and 4+, average English and maths grades, Progress 8 by subject area, value added in science, humanities and languages, EBacc entry, cohort size, % disadvantaged | Updated annually (provisional in autumn, revised in spring). Three years per file (currently 2022/23 to 2024/25); all three are kept. The catalogue file is 96 MB (156 columns, a row for every pupil group), so only the rows and columns the modules read are fetched through the DfE statistics API (a few MB): the whole-school total plus the sex, disadvantage, first-language and prior-attainment groups. The API has no establishment type group (the catalogue CSV has), so the register (GIAS) decides which schools are special. `z` and `c` mark missing or suppressed values. The older compare-school-performance download blocks scripted access. |
| [DfE key stage 4 performance, subject entries at school level](https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance), Department for Education (OGL v3) | Which GCSE subjects each school entered pupils for (languages, computer science, separate sciences, music, art, drama, statistics, further maths) and how many pupils | Updated annually (provisional in autumn, revised in spring). The full file lists every grade of every qualification for every school (hundreds of MB), so only the total GCSE entries per school and subject are fetched through the DfE statistics API, latest year only. Entries are divided by pupils at the end of key stage 4, so a share can exceed 100% and is capped. `z`, `c` and `x` mark suppressed values. |
| [Ofsted monthly management information: state-funded schools, latest inspections](https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes), Ofsted (OGL v3) | Inspection outcomes | Updated monthly. Windows-1252. Only the columns read are kept (17 MB downloaded, under 5 MB stored). The latest file is found through the GOV.UK content API. Doesn't cover independent schools (most are inspected by the ISI). |
| [DfE A level and other 16 to 18 results, schools and colleges](https://explore-education-statistics.service.gov.uk/find-statistics/a-level-and-other-16-to-18-results), Department for Education (OGL v3) | Sixth form results: average A level grade, best three A levels, AAB share, value added and retention | Updated annually (final results are published each January or February; a revised-results release follows in the autumn). Four years in one file (about 59 MB), and every exam cohort and disadvantage group; only the latest year and the all-students A level rows are used, so only those rows and the columns read are fetched through the DfE statistics API (well under 1 MB). Suppressed values are `c`, not applicable `z`. |
| [DfE Financial Benchmarking and Insights Tool: school income and expenditure (CFR for maintained schools, AAR for academies)](https://financial-benchmarking-and-insights-tool.education.gov.uk/data-sources), Department for Education (OGL v3) | Total spending and teaching-staff spending, for spending per pupil and the teaching share of spending | Updated annually (CFR in the winter after the financial year, AAR in the spring). Two Excel workbooks (about 8 MB and 7 MB) are downloaded, the newest CFR and the newest AAR, and cut down to the columns we use (a few hundred KB). Academies report as trusts, and the AAR file gives each academy its own spending without the trust central costs that the tool apportions to it, so academy figures are lower than the tool shows. The site refuses requests that do not look like a browser, so the download sends a browser-style user agent. |
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
2023/24. The map and popup say so, and point to Results vs intake (below), the nearest
intake-adjusted measure for those years.

**Results vs intake** (our own estimate). Attainment 8 minus the Attainment 8 expected for the
school's intake, shown as a percentile among state schools. It is the only recent measure that
allows for intake: Progress 8 is not published for 2024/25 (the file has no Progress 8 values at
all for that year, and DfE's own tables show only Attainment 8) and will not be for 2025/26,
because those pupils sat no KS2 tests during COVID. The latest Progress 8 is 2023/24.

*Method.* For each GCSE year, a multiple linear regression (ordinary least squares) of
Attainment 8 on six intake factors, fitted across non-selective state-funded mainstream schools.
The expected score is the fitted value; the result is `actual - expected`, in Attainment 8
points. The factors:

| Factor | Source | Effect on Attainment 8, 2024/25 |
| --- | --- | --- |
| % disadvantaged pupils in the GCSE year | KS4 file | -0.17 points per percentage point |
| % pupils with English as an additional language (whole school) | school census | +0.10 per percentage point |
| % low prior attainers | KS4 file | -0.15 per percentage point |
| % high prior attainers | KS4 file | +0.38 per percentage point |
| girls-only school | school register | +3.5 points |
| boys-only school | school register | +1.9 points |

Fitted on 2,903 schools. It explains 60.5% of the variation in Attainment 8 between schools
(R² = 0.605, residual standard error 4.5 points), against 24.6% (R² = 0.246) for the previous
model, which used % disadvantaged alone, on the same schools. In standardised terms (effect of a one
standard deviation change) the share of high prior attainers matters most, then % disadvantaged,
then English as an additional language, then % low prior attainers. The build prints every
fit and puts the latest year's R² and coefficients in the data's metadata (`intakeModel`).

*Choices.*
- **Prior attainment is last year's mix.** It needs KS2 results, which the 2024/25 cohort never
  sat, so each school's mix comes from the latest year that has one (2023/24). A school's intake
  changes slowly, and using it still lifts R² from 0.40 to 0.61 for 2024/25 (checked). It is a
  stand-in, so a school whose intake changed sharply will be mis-scored.
- **Area deprivation (IDACI) was tested and left out.** On top of % disadvantaged it adds
  nothing (R² unchanged to three decimals with or without prior attainment; +0.005 with only
  the other non-prior factors) and its sign is unstable, so it would only make the score harder
  to interpret. Free school meals % from the census was also left out: it raises R² by 0.003
  (0.605 to 0.608) because it largely repeats % disadvantaged.
- **Girls-only and boys-only schools** are adjusted for because girls score higher at GCSE
  nationally. This adds about 0.01 of R² on top of the prior-attainment model (0.03 without it),
  so it is a modest term. Single-sex schools can differ in other ways too, which end up in the
  coefficients.
- **Selective schools** are left out of the fit (about 160 grammar schools) but still scored.
  They score highly by design: their intake is selected on ability, which the model only sees
  partly through prior attainment. They are not given a "selective" term, so they are not
  compared with other grammar schools.
- **Special educational needs** is not used: DfE publishes no school-level SEN figures for
  secondary schools.
- **Fallbacks.** A school missing an input is scored with the richest model it has all the
  inputs for, never dropped: "full" (above), then "without prior attainment" (3,042 schools,
  R² = 0.398 against 0.251 for % disadvantaged alone), then "basic" (% disadvantaged only).
  In 2024/25, 2,903 schools use the full model, 303 the second and 2 the basic one. The model
  used is stored for each school.

*Uncertainty.* Each school also has a standard error (`att8VsIntakeSe`, Attainment 8 points):

`SE = sqrt(14.5^2 / pupils in year group + residual SE^2 * leverage)`

The first term is chance variation: a year group is a sample of the pupils the school could
have had, and one pupil's score varies around the school average with a standard deviation of
about 14.5 points (taken from the spread implied by DfE's Progress 8 confidence intervals,
which is almost the same for every school). The second term is uncertainty in the expected
score, which is small except for schools that look very unlike the others. It is stored
alongside `att8VsIntake`, so the value is approximately normal with that standard error,
which is all that is needed for P(A > B) = Phi((A - B) / sqrt(SE_A^2 + SE_B^2)). Standard errors run
from 0.7 to 4 points, with a median of 1.1. It does not include intake differences
the model cannot see (the residual standard error of 4.5 points is much larger than the
chance part), so it is a lower bound on the real uncertainty, and the percentile has no
margin of its own. The popup shows 1.96 x SE as "Margin of error", and says it covers chance
only.

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

**Funding: spending per pupil** (official figures, popup only). The "Funding" section shows total spending per pupil and the
share spent on teaching staff, beside the median for the same kind of school (2024/25). Maintained schools report themselves
(Consistent Financial Reporting, April to March). **Academies report through their trust** (Academies Accounts Return, September to
August); the public file gives each academy's own spending, but the DfE's Financial Benchmarking and Insights Tool then adds a share
of the trust's central costs to each academy (by pupil numbers, and by floor area for premises costs). That share is not in the
download, so **academy figures read lower than the tool shows**, and the popup compares academies only with academies. The two returns
can be for different years (the popup says so). A school with a return covering less than a full year is left out; an academy that
changed trust part-way through has its two returns added together. Not shown on the map: small, sixth-form and special schools cost more
per pupil, so a higher figure is not wrong. The popup links to the school's page on the finance tool. The two Excel workbooks are 15 MB
together (the site has no CSV or API), so they are read by a small built-in reader and cut down to about 0.2 MB.

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

**Trust view** (popup button, panel summary and `?trust=` link). A school run by a trust (from the
register's trust code, 2,802 of the mapped schools in 1,144 trusts) shows "See all 14 schools in this
trust" in its popup when the trust has other mapped schools. It shows only that trust's schools, fits
the map to them and puts a "Trust: X ✕" chip at the top of the panel, with the number of schools, the
median Attainment 8 percentile, the median Progress 8 and a count of our Ofsted summary levels. The
medians are of each school's own latest results (schools with no value are left out, and the count
says how many were used). They are our own summary, not an official trust measure, and a school may
have joined the trust after its latest results or inspection. Trusts also run schools that are not on
this map. The address carries the view (`?trust=5143`, `?urn=135315`), so it can be shared.

**Similar schools** (our own grouping; popup section, panel summary and `?similar=` link). A school's
popup says where it stands among its similar schools ("Attainment 8: 4th of 21; persistent absence, lowest
first: 7th of 21") and offers "See the 20 similar schools on the map", which shows only those schools,
fits the map to them and puts a "Similar to: X ✕" chip at the top of the panel with this school's figures
beside the median of the others. A school's similar schools are the 20 state-funded schools that are the
same kind (selective or not, and boys-only, girls-only or mixed) and closest to it on the share of
disadvantaged pupils, English as an additional language, low and high prior attainers (the same intake
figures as Results vs intake) and size (the number of pupils, on a log scale), plus a fixed penalty for
an urban school against a rural one. Each measure is rescaled by its spread across schools, so one is not
worth more than another just because its numbers are bigger, and "closest" means the smallest overall
distance. It is computed when the data is built (`dimensions/similar-schools`; the 20 URNs are stored on
each school as `similarUrns`) and is not symmetrical: B can be among A's 20 without A being among B's.
It is not an official grouping. DfE's financial benchmarking service picks its own comparison schools for
spending, with different rules; we do not use them.
Similar intake does not mean similar quality, and the grouping cannot see things such as special
educational needs or how the school admits pupils. Independent schools, and the 11% of state schools that
lack any of the figures (mostly no prior attainment, because their pupils were not in the last cohort that
sat KS2 tests), have no group and are in nobody else's. Later features can reuse it:
`parseSimilar`, `similarFocusValue` and `rankAmong` in `dimensions/similar-schools/shared.ts` read the set back,
and `findSimilar` in `model.ts` computes it.

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

### Comparing a shortlist

"Add to shortlist" in a school's popup builds a list of up to six state-funded schools (kept in your
browser, and in a shareable `?compare=<urn>,<urn>,...` link) and opens a full-screen comparison
(`dimensions/compare/`). It is computed in the browser. Opening someone else's `?compare=` link shows their list
in the panel without touching your saved one; "Save as my shortlist" keeps it, "Back to mine" returns.

- **Table.** Raw values with a 95% range, the England average (state-funded schools, and all schools; our own
  pupil-weighted averages of the schools on this map, not DfE's official figures) and a verdict beside each value.
  Only intake-adjusted measures (Progress 8, results vs intake) say a school is "better" in the sense of quality;
  raw results are labelled "results of pupils at this school (largely reflect intake)". The table says when
  Progress 8 is missing or older than the other results (it is currently not published for 2024/25).
- **Probabilities.** P(A > B) = Φ((a − b) / √(seA² + seB²)). Standard errors: Progress 8 from its published
  interval ((upper − lower) / 3.92); percentages binomial (a rate of exactly 0% is treated as half a pupil off
  it); Attainment 8 from the pupil-level spread (about 14.5) over √(year group). "Likely better" is 90% or more,
  "likely worse" 10% or less. These standard errors cover chance variation only and are not inflated for
  anything else, so they **understate** the real uncertainty; the page says so. Tap a cell of the head-to-head
  matrix for the probability.
- **Beaten on every measure.** A school that another is at least as good as on every ticked measure and likely
  better than on at least one (Ofsted, an ordered grade, can match but never make a school likely better; missing
  measures are skipped for that pair). Schools not marked are where priorities decide.
- **Priorities.** Weight sliders feed a seeded simulation (2000 draws): measures become percentiles among
  state-funded schools, each draw varies every figure within its standard error, and we report the chance of being
  strongest and a likely place range, or say it is a matter of preference when places overlap.
- **National rank band (on request).** 400 draws over every state-funded school give a 10th-90th percentile rank
  range ("roughly top 15-30%"), marked stable if it holds with each weight halved or raised by half. It runs on
  the main thread in short chunks (no Web Worker) and loads six extra data columns only when asked.
- **Applying.** The page states the equal-preference rule of the School Admissions Code and links to GOV.UK.

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
