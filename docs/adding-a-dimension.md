# Adding a dimension

A **dimension** is one kind of data about schools: GCSE results, Ofsted, absence, school size,
and so on. Each one lives in its own folder, `dimensions/<id>/`, and **adding one must not
require editing any file outside that folder**. The framework finds the folder, builds it,
types it, wires it into the browser and puts its source in the README.

If you find you need to edit a shared file (`lib/`, `web/`, `scripts/`), stop and check
whether the framework should grow instead. Small, general additions are fine; mention them in
your commit message.

## The shape of a dimension

```
dimensions/absence/
  source.ts   where the data comes from           (optional: only if you download something)
  parse.ts    reading the downloaded file          (optional; any helper files are fine)
  build.ts    fields + build(): rows for each school   (required)
  web.ts      modes, filters, popup sections, About text  (optional: data with no UI is fine)
  test.ts     tests                                (required)
  fixtures/   a few rows of each source you add     (required if you add a source)
```

How the pieces connect:

```
npm run fetch        source.ts  -> data/<id>.csv        (+ data/sources.json with the URLs)
npm run build:data   build.ts   -> build/schools.sqlite -> dist/data/ (core, modes/, details/, manifest.json)
npm run generate     build.ts fields -> web/generated/fields.ts   (the SchoolRecord type)
                     web.ts files    -> web/generated/registry.ts (what the browser imports)
                     source.ts       -> the README sources table
npm run build:web    web/ + every dimensions/*/web.ts -> dist/app.js
```

`build`, `build:web` and `typecheck` all run `generate` first, so you rarely call it yourself.
`web/generated/` and `build/` are git-ignored.

## Walkthrough: a worked example

Say you are adding "school size" (quintile of pupil numbers). Create `dimensions/school-size/`.

### 1. build.ts

```ts
import { defineDimension } from '../../lib/dimension.ts';

export const module = defineDimension({
  id: 'school-size',                 // must equal the folder name
  title: 'School size',
  dependsOn: ['gias-core'],          // modules whose rows you read; they are built first
  fields: {
    sizeBand: {
      type: 'number',
      placement: 'mode',             // see "Placement" below
      label: 'School size band',
      description: 'Quintile (0 smallest to 4 largest) of pupil numbers among state schools',
    },
    bigSchool: { type: 'boolean', placement: 'mode', label: 'Over 1,500 pupils', nullable: false, default: false },
  },
  build(ctx) {
    const pupils: [number, number][] = [];
    for (const [urn, r] of ctx.read('gias-core')) if (typeof r.pupils === 'number') pupils.push([urn, r.pupils]);
    const rank = ctx.stats.percentileAmongState(pupils);
    return pupils.map(([urn, n]) => ({ urn, sizeBand: Math.min(4, Math.floor(rank(n) / 20)), bigSchool: n > 1500 }));
  },
});
```

`build()` returns one row per school that has data: `{ urn, ...fields }`. Rows for URNs that
are not in scope are dropped (and counted in the log). Schools you return no row for get `null`
(or the field's `default` when `nullable: false`). You never need to emit nulls yourself.

`build()` may also return `{ rows, extra, metadata }`; see "Extra tables" and "Metadata".

### 2. web.ts

```ts
import { h, type FilterDef, type ModeDef, type PopupSectionDef } from '../../web/toolkit.ts';

export const modes: ModeDef[] = [{
  id: 'size', label: 'School size', order: 900, palette: 'sequential',
  description: 'Number of pupils, as a quintile among state schools.',
  buckets: [{ label: 'Largest 20%', colour: 4 }, /* ... down to colour 0 */],
  bucketOf: (p) => (p.sizeBand === null ? null : 4 - p.sizeBand),   // index into buckets, or null = "No data"
  sortValue: (p) => p.pupils,                                        // list ranking, higher first
  formatValue: (p) => (p.pupils === null ? '–' : p.pupils.toLocaleString()),
}];
```

`p` is a fully typed `SchoolRecord`, generated from every module's `fields`; a typo in a
field name is a compile error. See "Web exports" for filters, popup sections and the rest.

### 3. test.ts and run

```bash
npm run typecheck
node --disable-warning=ExperimentalWarning --test dimensions/school-size/test.ts
npm run build                      # then check it in a browser
node scripts/diff-geojson.ts /tmp/old-data dist/data --allow-new-properties
```

The last command proves you changed nothing that existed before (see "Proving you changed
nothing").

## Phases (secondary and primary)

The map has two separate datasets, one per phase (`secondary`, the original, and `primary`; the list is in
`lib/phase.ts`). Each is built into its own store and output (`build/schools.sqlite` and `dist/data/`, and
`build/primary.sqlite` and `dist/data/primary/`) and the browser loads only the phase it is showing. The
secondary output is unchanged by phases, so existing paths and caches keep working.

- `build.ts`: add `phases: ['primary']` (or `['secondary', 'primary']`) to `defineDimension`. The default is
  secondary only, so existing modules need nothing. The pipeline runs once per phase over just the modules
  that declare it; `ctx.phase` says which phase is being built. A module must be declared for every phase of
  the modules it depends on, and every module's phases must be covered by the scope module (`gias-core`),
  which decides which schools are in each phase. Field names are shared across phases, so a field that exists
  in both must mean the same thing.
- `web.ts`: modes, filters, popup sections, rows, tags, source notes and extensions follow their module's
  phases. Add `phases` to one item to narrow it (the sixth-form filter is `phases: ['secondary']` although
  `gias-core` is in both). Ids must be unique within a phase, not across them, so two modules can each have a
  `trust` filter for different phases.
- Tests: `buildFromFixtures(id, 'primary')` builds the fixtures for a phase (default: the module's first
  phase). Primary fixtures are the 9000xx rows in `dimensions/gias-core/fixtures/gias.csv`.
- Primary sizes: the primary core is about 365 KB gzipped (16,700 schools), so it has its own budget under
  `phases.primary` in `budgets.json`. Keep new primary fields out of core all the same.
- `scripts/build-data.ts` builds both phases and `verify-data` checks both. `export-release` and the GeoJSON
  diff only cover secondary.

## Naming rules

- Module id and folder: lower-case, digits, single hyphens (`school-size`). Must match.
- Field names (GeoJSON property names): camelCase, **globally unique across all modules**.
  Prefix them with the topic (`absencePersistentPct`, not `persistent`). The build fails and
  lists every clash. `urn` is reserved.
- Source ids (`SourceDef.id`): lower-case, **globally unique**, and normally the dataset's
  short name (`ks4`, `ofsted`). The id is also the file name `data/<id>.csv` and the key in
  `data/sources.json`.
- Mode, filter, popup section, tag and source-note ids: unique across all modules (duplicates
  throw when the app starts). Filter ids are also the localStorage key, so never rename one
  casually. Prefix with your topic if the name is generic.
- Extra table names: lower_snake_case.
- A year field: a field that has a year (`xxxYear`, string like `2024/25`) should be declared
  next to its data and referenced with `year: 'xxxYear'` on each field it describes.

## Fields

```ts
{ type: 'number' | 'string' | 'boolean' | 'enum', placement, label, description?, source?,
  year?, nullable?, default?, lazy?, decimals? (number), unit? (number), values (enum) }
```

- `label` is plain English; `description` says what it is and any caveat. These are published in the monthly
  release's data dictionary (`fields.csv` and the `fields` table), so write them for a reader who has not seen
  the source: what it is, its unit, and any caveat.
- `source` is the id of the `SourceDef` it came from. `year` names the field holding the data year.
- Values are validated when stored: a number must be finite, an enum value must be in `values`,
  a boolean must be a boolean. Numbers are rounded to `decimals` when you set it.
- `nullable: false` means every school has a value; give it a `default` for schools with no row.
  Use it sparingly: `null` ("no data") is usually the honest answer.
- Several fields with the same shape (a measure for each of three groups) can come from a small helper that
  returns the fields; give it a typed return (`Record<\`prior${G}Pct\`, NumberField>`) so the generated
  `SchoolRecord` keeps exact names. `dimensions/ks4-prior-attainment/build.ts` shows it.
- Prefer enums to free strings when the set is small and known: they become union types in the browser.
- Store percentages as 0-100 numbers, dates as ISO strings (`2025-01-29`), and never store
  derived display text (`"41.5 (27th percentile)"`): format that in `web.ts`.

### Placement

`placement` says how early the browser needs the field, and decides which published file it
goes in (see "How the data is published" below). If in doubt, choose `detail`.

| Placement | Meaning | Examples |
| --- | --- | --- |
| `core` | Needed at start-up: identity, search, filters that are on by default, and whatever the **default map mode** (the one with the lowest `order`) uses. Keep this tiny: every visitor downloads it. | `name`, `sector`, `p8`, `p8Band` |
| `mode` | Needed for every school, but only once a mode, filter or the ranked list uses it. One small file per field, fetched the first time. | `att8`, `att8Pct`, `ofstedSummary` |
| `detail` | Only shown in the popup for one school at a time. | `engMaths5`, `rcInclusion`, `website` |

You never declare *which* modes, filters or popup sections use a field: the build runs every
`bucketOf`, `sortValue`, `formatValue`, filter `test` and popup `render` over every school with a
recorder and works it out. The only thing you must get right is the placement, and the build
tells you when you don't:

- **Error**: a mode or filter reads a `detail` field (it would not be loaded). Make it `mode`.
- **Note** (printed by `build:data`, not fatal): the default mode or a default filter reads a
  `mode` field (promote it to `core`, or start-up costs an extra request); a `core` field nothing
  needs at start-up; a `mode` field no mode or filter reads (make it `detail`).

Rules of thumb:

1. A field used only by a popup section is `detail`.
2. A field a mode colours by or ranks by (`bucketOf`, `sortValue`, `formatValue`) is `mode`;
   a filter's field is `mode` too (`core` if the filter is on by default).
3. If your dimension's mode becomes the default mode (lowest `order`), its fields become
   `core`. Do not do this casually: it changes the start-up download.
4. Fields you read from another module are that module's business: don't redeclare them.

### How the data is published

`npm run build:data` writes `dist/data/`:

- `core.json`: school ids, positions and every `core` field as columns (enums as integers, booleans
  as 0/1, so key names are not repeated per school), plus the field table and the field lists
  found above. Budget: 200 KB gzipped (see "Size budgets").
- `modes/<field>.json`: one column per `mode` field, in core's order. Fetched when a mode or
  filter first reads it; a second use costs nothing.
- `details/<n>.json`: **all** non-core fields (`mode` ones too) for up to 40 schools (about 32 today) whose
  `urn % shards == n`. A popup is one request however many fields it reads. Missing values (null or
  the field's default) are left out.
- `manifest.json`: raw and gzipped size of every file, for budget checks.

In the browser, search, the list and hover tips read only core fields and the current mode's
columns. A popup opens at once and shows "Loading…" for sections whose fields are still coming.
Your `web.ts` code needs no loading logic: write `p.x` as usual. Two consequences:

- Reading a `detail` field in `bucketOf`, `sortValue`, `formatValue` or a filter `test` fails the
  build (see above).
- Don't reach fields through anything but `p`: a `Proxy` on `p` is how reads are found, so
  `const q = { ...p }` or `Object.keys(p)` would hide them or read everything.

## Reading other modules: dependsOn

```ts
dependsOn: ['gias-core', 'ks4-headline'],
build(ctx) {
  const ks4 = ctx.read('ks4-headline');           // Map<urn, { att8: 41.5, ... }>  declared fields, decoded
  const history = ctx.readExtra('ks4-headline', 'history');
}
```

- You may only read modules listed in `dependsOn`; anything else throws. The scope module
  (`gias-core`) is always built first, whether or not you list it. Dependencies are built
  before dependents; a cycle fails with the modules named.
- Reading gives you the **stored** values (rounded, validated), the same as the final output.
- Avoid depending on another module just to join a column. Dimensions that merely add data for
  a school should depend only on `gias-core`.

## Extra tables (long-format data)

Use these when a school has several rows: per year, per subject, per destination. Do not
flatten them into `fooYear1`, `fooYear2` fields.

```ts
extraTables: {
  history: {
    description: 'One row per school and year',
    columns: { year: 'text', cohort: 'integer', att8: 'real' },   // 'text' | 'integer' | 'real'
  },
},
build(ctx) {
  return { rows: [...], extra: { history: [{ urn: 1, year: '2024/25', cohort: 146, att8: 41.5 }] } };
}
```

`urn` is added for you and an index is created. Extra tables are not in `dist/data`;
they live in the store (`build/schools.sqlite`, table `dim_<id>__<name>`) for other modules and
for later per-school detail files. Any field you want in the popup today must also be a normal
field (summarise the table into a few fields).

### The published dataset

Every month the deploy also publishes the store as GitHub Release files (`npm run export-release` writes
them to `release/`): `schools.csv` (one row per school, every field), `england_schools.sqlite`, `fields.csv`
(the data dictionary) and `sources.csv`. You do nothing for this: it is generated from your declarations,
so a new module and its `extraTables` are included automatically.

- Fields and extra-table columns become dictionary rows from `label`, `description`, `type`, `unit`, `year`
  and `source`, plus how many schools have a value. Extra tables are `dim_<id>__<name>` in the SQLite file
  (columns have no label, so the table `description` is used). Missing labels and descriptions show up in
  public, so fill them in.
- Suppressed values are `null`: the original codes are not kept.
- **No personal data.** GIAS has head teacher names (`HeadTitle`, `HeadFirstName`, `HeadLastName`,
  `HeadPreferredJobTitle`) and telephone numbers; never read them into a field. A field, table or column whose
  name looks like personal data (head teacher, phone, email, a person's name, proprietor...) fails
  `lib/release.test.ts` and the export, and so does any string value that is an email address or a UK phone
  number. The patterns are in `lib/release.ts` (`PERSONAL_DATA_NAMES`). If one matches something harmless,
  rename your field rather than loosening the list.

## The build context

| Member | Use |
| --- | --- |
| `ctx.csv(sourceId)` | Streams a downloaded CSV as objects, in the encoding declared on the `SourceDef`. Parsed once per build and shared (see "Sources several modules read"). |
| `ctx.dataPath(sourceId)` | The file path, for non-CSV sources or custom parsing. |
| `ctx.sources` | Resolved download URLs (put one in the About text via `h.sourceLink`). |
| `ctx.schools` | The in-scope schools: `.urns`, `.all`, `.get(urn)`, `.isState(urn)`. Use it to ignore rows for schools you do not show. |
| `ctx.read`, `ctx.readExtra` | See above. |
| `ctx.stats` | See below. |
| `ctx.log(msg)` | Progress line, prefixed with your module id. Log counts ("3,812 schools matched"). |

### Sources several modules read

Parsing the 96 MB KS4 file takes about 17 seconds, so it must not be repeated per module. Inside a
`parse.ts`, read a shared source with `readCsvShared(file, encoding?)` from `lib/csv.ts` instead of `readCsv`.
It has the same shape (an async generator of rows), but the first call parses the file and every later call in the
same build replays the same rows from memory (about 1 GB for KS4; the pipeline frees it when the build ends).
`ctx.csv(sourceId)` is shared the same way. Rules: treat rows as read-only, and use plain `readCsv` for a file
only one module reads. All `ks4-*` modules use it; with it the whole `build:data` went from 173 s to 32 s.

Parse defensively: DfE files mark missing values with `z`, `c`, `x`, `NE`, `SUPP` and similar.
`lib/csv.ts` has `text()` and `num()` helpers that turn the usual markers into `null`. Look at
the real file with `head` before writing a parser, and parse by header name, not column position.

### Stats

```ts
const rank = ctx.stats.percentileAmongState(pairs);           // pairs: [urn, value][]
const rankLowGood = ctx.stats.percentileAmongState(pairs, { higherIsBetter: false });
ctx.stats.nationalMedianAmongState(pairs);
ctx.stats.linearFit(points);   // { intercept, slope, r }
ctx.stats.mean(values); ctx.stats.round(value, 1);
```

Percentiles are among **state-funded mainstream schools** only: independent schools can be in
the pairs but are ignored for the ranking (they are not comparable on most measures). Rank
within a year, never across years. Derived measures should say so in their `description` and
in the mode text ("our own estimate, not an official measure").

### Metadata

Return `{ rows, metadata: { absenceYear: '2023/24' } }` to publish dataset-level values.
They appear as `collection.metadata.absenceYear` in the browser, for mode descriptions, popup
titles and the About dates. Metadata keys are global; prefix them with your topic. Values
must be JSON.

## source.ts

```ts
export const sources: SourceDef[] = [{
  id: 'absence',
  describe: 'DfE pupil absence in schools in England',          // README "Source" column
  homepage: 'https://explore-education-statistics.service.gov.uk/...',
  publisher: 'Department for Education',
  licence: 'OGL v3',
  updated: 'annually',
  usedFor: 'Overall and persistent absence rates',                // README "Used for" column
  notes: 'Suppressed values are `x`.',                            // README "Notes" column
  resolve: async () => eesCsvUrl('<data-set id>'),               // or an array of candidate URLs
  encoding: 'utf-8',                                              // default; GIAS and Ofsted are 'windows-1252'
}];
```

- `npm run fetch` downloads every source that is not already in `data/` and records the URL in
  `data/sources.json`. `npm run fetch -- absence` fetches only that source; `-- --force`
  re-downloads.
- **Explore Education Statistics** data sets: `lib/ees.ts` has `eesCsvUrl(dataSetId)` and
  `latestEesCsvUrl(dataSetId)`. The catalogue URL is
  `https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/<file id>/csv`;
  use the **file id** of the latest version, which `latestDataSetId()` looks up through the public
  API (its `pageSize` maximum is 20). Check the file exists before relying on it.
- If the URL changes over time (a date in the name, a link on a GOV.UK page), do the lookup in
  `resolve()` and return the candidates in order; the first that downloads wins.
- **Download only what you read.** Every run that refetches pays for the whole file, so a new source should
  keep just the rows and columns its modules use: a source in the EES API goes through `downloadEesQuery`
  (below); any other CSV through `downloadFilteredCsv(url, file, { columns, keep, latestPeriod, encoding })`
  in `lib/filter-csv.ts`, which streams it and writes only those (`latestPeriod: 'newest-first'` stops the
  transfer after the newest year; `encoding` keeps GIAS and Ofsted as Windows-1252). A column a module starts
  reading must be added to the source's list: the download fails on a missing column rather than hiding it.
- **Large EES data sets**: if a file is too big to download on every deploy (the school census is
  2.8 GB), use `fetchTo` instead of `resolve`. `fetchTo: async (file) => pageUrl` writes the CSV
  to `file` itself and returns the page URL to record in `data/sources.json`. For EES data sets,
  `downloadEesQuery({ dataSetId, filters, indicators }, file)` in `lib/ees.ts` posts to the
  public API's `/query` endpoint at School level (the latest period, or `periods: 'all'` / a number),
  pages through the results and writes a CSV with `time_period`, `school_urn`, the filter columns and the
  indicator columns. `also` adds row sets with fewer indicators, `hide` drops filter columns, and `derive`
  adds computed columns (see `dimensions/ks4-headline/source.ts`).
  Data-set ids in the API are stable, unlike catalogue file ids. See `dimensions/census/source.ts`.
- Sources must be open data you may redistribute (OGL v3 or compatible). Scripts blocked by a
  site (403 for non-browser clients) mean choose a different published route and say so.
- One source file may feed several modules; define it in one and use `ctx.csv('<id>')` from the other
  (add the owner to `dependsOn` only if you need its rows, not just the file).
- The README sources table is regenerated from all `source.ts` files between its marker
  comments. Never edit it by hand.

## Web exports (web.ts)

`web.ts` may export only these names (the generator rejects anything else, which catches
typos). Import helpers from `../../web/toolkit.ts`, and nothing else from outside your folder
except other `web.ts`-safe modules (pure code, no Node APIs: it runs in the browser). Share
constants between `build.ts` and `web.ts` through a third file (`bands.ts`, `grades.ts`).

Everything is sorted by `order`. Leave gaps (10, 20, 30) so others can slot in between.
Existing orders: modes p8 10, intake 20, att8 30, ofsted 40; popup sections progress8 10,
gcse 20, ofsted 8; filters 10-50. New modes should start at 100 and up unless the issue says
where they belong.

### `modes: ModeDef[]`

A "Colour by" option: `id`, `label`, `order`, `description` (string, or a function of the
metadata), `palette` (`'diverging'` default, or `'sequential'`), `buckets`, `bucketOf`,
`sortValue`, `formatValue`. The mode with the lowest `order` is the default.

- Palette: **diverging** (red to blue) only when there is a good and a bad end. Everything else
  uses **sequential** (teal, light to dark). A `Bucket.colour` is an index 0-4 into the palette
  (4 = best or highest, listed first in the legend). For another palette, add it in
  `web/palette.ts`, validate it with the dataviz validator, and keep light and dark variants.
- Never rely on colour alone: the legend has labels and counts, the list has values.
- Five buckets map directly; fewer is fine (use the indices that spread best, e.g. 0, 2, 4).
  `QUINTILES` and `quintile(pct)` from the toolkit cover percentile fields.
- `bucketOf` returns `null` for "No data" (grey ring).
- `description` should say what is measured, the year, and the main caveat in plain language.

### `filters: FilterDef[]`

Controls in the "Show" panel. A filter is `{ id, order, control, default, test }`:

```ts
{ id: 'big', order: 100, control: { kind: 'checkbox', label: 'Over 1,500 pupils only' }, default: false,
  test: (p, on) => !on || p.bigSchool }                       // return true to keep the school
{ id: 'region', order: 110, control: { kind: 'select', label: 'Region', options: [{ value: '', label: 'Any' }, ...] },
  default: '', test: (p, value) => !value || p.region === value }
```

A filter can depend on a checkbox with `enabledBy: '<checkbox filter id>'`, for a select that only makes
sense once the checkbox is ticked (`dimensions/sen-provision/web.ts`: "Has an SEN unit" and "Type of need").
While the checkbox is off, the control is greyed out and the filter is ignored: its `test` is not called and
its columns are not loaded. Its saved value is kept. Give it a higher `order` than its checkbox, so it sits
underneath.

Give a checkbox or select a `group` (a key of `FILTER_GROUPS` in `web/toolkit.ts`) to list it in a collapsible
section of "Show". A section starts open if it has `open: true` or one of its filters is in use. Without `group`
the control sits at the top, always visible. Focus (chip) filters are never listed there.

A third kind, `control: { kind: 'chip', label, chipText, summary? }`, is a **focus filter**: a set of schools chosen
from elsewhere (a popup button made with `h.filterButton(id, value, label)`, or a link `?<id>=<value>`) rather than a
control in the "Show" list. While set, the map shows only the matching schools and fits to them, and the panel
shows a "Label: text ✕" chip that clears it plus the optional `summary(schools, value, h, meta)`. It is not saved in
localStorage; the URL carries it. Its `test` must return true for `''` (off) without reading any field. The fields
`test`, `chipText` and `summary` read are traced and loaded when it is set. `dimensions/trust/web.ts` is the example;
a shortlist or "similar schools" view can reuse it. `?urn=<school>` opens a school's popup the same way.

Values are saved per filter id in localStorage and validated on load (unknown ids, wrong
types and removed options are ignored), so adding or removing filters never breaks a saved visit.
Keep the default as "show everything" unless the issue says otherwise.

### `popupSections: PopupSectionDef[]`

A titled block in the school popup: `{ id, order, title, render }`. `title` is a string or a
function of the school; `render(p, h, extra)` returns `Html` or `null` (null omits the section,
title included). Use the `h` helpers; interpolating into `h.html` escapes automatically:

```ts
render: (p, h) => h.html`${h.rows([['Pupils', p.pupils], ['Size band', p.sizeBand]])}${h.note('Quintiles among state schools.')}`
```

`h.rows` (label and one value), `h.table` (a heading row and several value columns), `h.note`, `h.meta`, `h.link`, `h.ciChart`, `h.fmt`, `h.signed`, `h.ordinal`,
`h.formatDate`, `h.html`, `h.raw`. Never build HTML by string concatenation: `Html` marks safe
markup; plain strings are escaped. `h.raw` is for static markup you wrote yourself, never for data.

Add `group: 'results'` (or another key of `POPUP_GROUPS` in `web/toolkit.ts`) to put a section inside a
collapsible group of the popup. A group sits where its first section would, and only `open: true` groups start
open. A group holding a single section uses that section's title as its heading. Leave `group` out for a
short section that should always show (Ofsted, links). Add a new group to `POPUP_GROUPS` only if none fits.

### `popupRows: PopupRowDef[]`

Adds a row to **another module's** section without editing it, e.g. `{ id, section: 'gcse', slot:
'after-average', order: 10, row: (p, h) => ['Label', value] | null }`. The section decides where
a slot goes by calling `extra('slot-name')` (unslotted rows via `extra()`). A row aimed at a
section or slot that does not exist is ignored. If your own section would benefit from
extension by later modules, call `extra()` in your `render`, and document the slot names in a
comment. `dimensions/ks4-headline/web.ts` and `dimensions/intake-model/web.ts` show both sides.

### `popupTags: PopupTagDef[]`

The small chips under the school's name (`Independent`, `Sixth form`): see `gias-core/web.ts`.

### `sourceNotes: SourceNoteDef[]`

`about(meta, h)` returns an item for the "About the data" list (use `h.sourceLink('<source id>',
'Label')` to link to the downloaded URL), and `dates(meta)` returns strings for the dates line
under the title (`'Ofsted to 31 August 2026'`). Provide both for every source you add.

### `extensions: ExtensionDef[]`

A feature with an interface of its own rather than a map mode, filter or popup piece (the shortlist
comparison is one). `start(app)` runs once the map and data are loaded and gets an `AppApi`: the loaded
`data`, `addPanelSection(el)`, `openSchool(urn)`, `setFocus(filterId, value)`, `focusValue(filterId)`,
`isNarrow()` and `collapsePanel()`. Keep all DOM and CSS code in `web-ui.ts` and load it from `start` with a
dynamic `import()`: the Node-side build loads every `web.ts` and must never see DOM or CSS imports (the node
tsconfig excludes `web.ts` and `web-*.ts`; the web one includes them). CSS imported there is bundled into
`app.css`. A failing extension is logged and does not stop the map. Fields it needs for every school can be
`mode` placement even if no mode reads them; mark such a field `lazy: true` so the build does not note that
nothing reads it. The extension loads the columns with `data.ensureFields`. See `dimensions/compare/`.

## Reusable pieces for later modules

Several features have already been built from the same few parts. Reuse them rather than adding new
plumbing to `web/main.ts`.

**Focus (chip) filters and deep links.** Any "these schools" view (a trust, similar schools, a shortlist) is a
`chip` filter. You do not write URL code for it. `web/main.ts` does this for every chip filter:

- `setFocus(chip, value)` turns it on or off (`''`), loads the columns its `test`, `chipText` and `summary` read,
  ignores a value that matches no school, closes the popup, and fits the map to the matching schools with
  `fitToSchools`. Open it from a popup with `h.filterButton(id, value, label)`; from an extension call
  `app.setFocus(id, value)` (and `app.focusValue(id)` to read it).
- `syncUrl()` keeps the address in step: `?urn=<school>` for the open popup and `?<chip id>=<value>` for each
  active focus filter, with commas left readable. At start-up the same parameters are read back, so a shared
  link (`?trust=17396`, `?similar=100049-...`, `?compare=1,2,3`) reproduces the view. A value matching no
  school is dropped. A chip filter is never saved in localStorage.
- `fitToSchools` and `syncUrl` are internal to `main.ts`; a module only needs to add the chip filter. The value's
  format is yours (trust: a trust code; similar: URNs joined by `-`; compare: URNs joined by `,`). Cache the parsed
  set in a `Map` as `similar-schools/web.ts` and `compare/web.ts` do, because `test` runs once per school on each redraw.

**The similar-schools set.** `dimensions/similar-schools/shared.ts` is browser-safe and shared by that module's
build and web code and by `compare`. A school's `similarUrns` field holds the URNs of its nearest schools joined by
`-`. `parseSimilar(similarUrns)` returns them as numbers, `similarFocusValue(urn, similarUrns)` builds the value for the
`similar` focus filter (the school first, then its set), and `rankAmong(value, others, higherIsBetter)` gives
`{ rank, of }` (1 is best, ties share the better place) for placing a school among a set. Use these instead of
re-parsing the field, and import them from `shared.ts` (not `web.ts`) so no filter is registered twice.

**The `extensions` export.** For a feature with its own screen (`compare` is the example; its `web.ts` also
exports a chip filter and a popup section that the extension wires up). `extensions: [{ id, start(app) }]`, with the DOM
code behind a dynamic `import()` of `web-ui.ts` (see "`extensions`" above).

**Groups.** A popup section's `group` (a key of `POPUP_GROUPS`) and a checkbox or select filter's `group` (a key of
`FILTER_GROUPS`), both in `web/toolkit.ts`, put it in a collapsible section. Leave `group` out for something that
should always show. Add a new group only if none fits; a popup group with one section uses that section's title.

**The metadata argument.** `render(p, h, extra, meta)` of a popup section, and `summary(schools, value, h, meta)`
of a chip filter, get the dataset metadata as an optional last argument (national medians, data years). It is
`undefined` while the build traces which fields a piece reads, so write `meta?.x` and cope with its absence.

## Tests (test.ts)

Run with `node:test` and `node:assert/strict`. Every dimension needs a `test.ts`. Tests work from
**small committed fixtures**, never from `data/`, so they run in CI before anything is
downloaded, and on a fresh clone.

### Fixtures

For each source you add, commit a few-row extract at
`dimensions/<id>/fixtures/<file>`, where `<file>` is the name `fetch` gives it (`data/<source id>.csv`,
or `SourceDef.file`). It must be in the same encoding the real file is (`SourceDef.encoding`), though
ASCII is fine. Keep the real header names (or at least every column you read) and:

- use URNs from the schools already in the map fixtures (`dimensions/gias-core/fixtures/gias.csv` and
  `dimensions/ks4-headline/fixtures/ks4.csv`: 20 schools, 100049 Haverstock School among them); rows for any
  other URN are dropped as out of scope. A handful is enough for most modules; use all 20 if you rank or fit
  (percentiles, as `intake-model` does);
- include a school with **suppressed values** (`z`, `c`, `x`, `SUPP`...), one that is independent, and one
  that has no row at all in your source;
- when your module reads a source another module owns (as `ks4-prior-attainment` reads `ks4`), there is only one
  fixture file, the owner's: append your rows to it (same header; keep the existing rows, whose tests depend on
  them) and run the owner's tests too;
- extract rows with a throwaway script from the real file, and write the expected values from the source
  rows, not from your own parser's output. Do not commit full files (more than a few dozen KB is too many).

### Template

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import { loadAbsence } from './parse.ts';

const fixture = new URL('./fixtures/absence.csv', import.meta.url).pathname;

// 1. The parser, on the fixture file directly: known URNs, and suppression codes become null
test('absence parser: a known school, and suppressed values are null', async () => {
  const absence = await loadAbsence(fixture);
  assert.equal(absence.get(100049)?.overall, 8.1);   // from the fixture row, not from the parser
  assert.equal(absence.get(109694)?.overall, null);  // "x" in the source
});

// 2. The whole module: runs build() on fixtures (plus the modules it dependsOn) into a throwaway store
test('absence: values on the stored rows', async () => {
  const { rows } = await buildFromFixtures('absence');
  const r = rows('absence').get(100049);
  assert.equal(r?.absenceOverallPct, 8.1);
  assert.equal(rows('absence').has(100001), false);   // independent schools are not in this source
  for (const [urn, row] of rows('absence')) {
    const pct = row.absenceOverallPct as number | null;
    assert.ok(pct === null || (pct >= 0 && pct <= 100), `${urn}: ${String(pct)}`);
  }
});
```

`buildFromFixtures(id)` returns `{ rows(moduleId), extra(moduleId, table), urns, metadata }`: the
decoded rows of the module (and of any module it depends on) exactly as the real build stores them. It
builds once per test file, in well under a second. A module that reads another module's source
without depending on it (as `gias-core` does with `ks4`) finds that fixture in the owner's folder.

Also assert invariants (values within range, enums valid) and every suppression code your source
uses. Pure logic (bands, mappings) can use inline values. Percentiles and fits over 20 schools differ
from the real ones, so test them against a hand calculation (see `intake-model/test.ts`), not real values.

Checks against the real build (`build/schools.sqlite`) are still possible with
`moduleRows` and `skipWithoutStore` from `lib/test-store.ts`, but they skip on a clean clone and in CI's test
step, so prefer fixtures.

Run one module's tests: `node --disable-warning=ExperimentalWarning --test dimensions/<id>/test.ts`.
`npm test` runs everything: every `dimensions/*/test.ts`, plus `lib/*.test.ts`, `web/*.test.ts`
and `scripts/*.test.ts`.

## Size budgets

`budgets.json` holds the limits that CI enforces on pull requests (`npm run check-budgets`, after a
build). Gzipped, as downloaded:

| File | Budget | When this was set |
| --- | --- | --- |
| `core.json` (every visitor) | 200 KB | about 111 KB |
| each `modes/<field>.json` | 50 KB | largest about 7 KB |
| each `details/<n>.json` | 40 KB | largest about 8 KB |
| primary `core.json` (primary visitors) | 380 KB | about 352 KB (16,700 schools) |
| JS bundle (`app.js` + `maplibre-gl-shared.mjs`) | baseline +10% | about 436 KB |

These leave room for about 25 more dimensions. If your change fails a budget:

1. Check the placements first: a field only the popup shows is `detail`, not `mode`; only fields that the
   default mode or a default-on filter read belong in `core`.
2. Don't store free text or long arrays as fields; summarise them.
3. Only if the growth is intended, raise the number in `budgets.json` and say why in the pull request (and for
   the bundle, update `baselineGzipKB`).

`npm run check-budgets -- --previous <manifest path or URL>` also shows the change against an earlier
manifest (CI uses the live site's). The table is also written to the Actions run summary.

## What the build checks for you

`npm run build:data` fails, with the module and school named, when:

- a row has a field you did not declare, a value of the wrong type, or an enum value not in `values`;
- two rows have the same URN;
- two modules declare the same field, source id, or module id;
- `dependsOn` names an unknown module, or modules depend on each other in a circle;
- a `year` or `source` names something that does not exist; a non-nullable field has no default;
- fewer than 3,500 schools come out (usually a changed source format).

It **warns** (and carries on) when a field's coverage drops by more than 20% against the
previous build: usually a renamed column. Read the warnings.

## Proving you changed nothing

Before you start, build the current output and keep a copy:

```bash
npm run build:data && cp -r dist/data /tmp/old-data
```

After your change:

```bash
node --disable-warning=ExperimentalWarning scripts/diff-geojson.ts /tmp/old-data dist/data --allow-new-properties
```

It reports every feature and property that differs, ignoring property order and `builtAt`,
and exits 1 on any difference. `--allow-new-properties` permits your new fields only; every
existing value must be identical. (If fresh data legitimately changed things, say so in your
report rather than hiding it.)

## Definition of done

- [ ] `npm run typecheck`, `npm test` and `npm run build` pass; about 4,150 schools still come out; `npm run check-budgets` passes.
- [ ] `diff-geojson --allow-new-properties` shows 0 differences against the previous build (it rebuilds school records from `dist/data` first). `build:data` also verifies the files against the store.
- [ ] Browser check (Playwright): the new mode, filter and popup work; no console errors;
      screenshots in light, dark and 390 px wide.
- [ ] Data size reported before and after from `dist/data/manifest.json` (core, largest mode column, largest shard, total; gzipped).
- [ ] Fields have honest placements, labels and descriptions; derived measures say they are derived.
- [ ] `test.ts` and `fixtures/` cover parsing, known schools and suppressed values, without needing `data/`.
- [ ] No files outside `dimensions/<id>/` changed, except deliberate framework growth (explain it) and rows appended to a shared source's fixture.
      The README sources table is regenerated, not hand-edited: commit the result of `npm run generate`.
- [ ] README "How schools are compared" updated if you added a mode or a derived measure.
- [ ] `data/`, `build/`, `dist/` and `web/generated/` are not committed.

## Known limitations

- The build parses `ks4.csv` twice (`gias-core` needs it to decide which schools are in scope);
  the whole build takes about 45 seconds.
- Percentile/ranking helpers cover state schools only.
