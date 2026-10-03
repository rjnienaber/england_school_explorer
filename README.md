# schools_performance

Display UK schools performance on a map.

This project prepares performance data for English secondary schools that teach up to age 18 (schools with a sixth form). The output is meant to feed a map, but only the data preparation exists so far. There is no map front end yet.

## Data source

The data comes from the Department for Education's **School and college performance tables**:

- <https://www.compare-school-performance.service.gov.uk/download-data>

From that page, download the zip for an academic year with **"All data"** selected for England. The zip contains many CSV files. Two of them are used here:

| CSV in zip                       | SQLite table                  | Used for                                                          |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `england_school_information.csv` | `england_school_information`  | School name, local authority, town, postcode, status, phase, ages |
| `england_ks4final.csv`           | `england_ks4final`            | Key Stage 4 (GCSE) results: Attainment 8, Progress 8, EBacc       |

The two tables are joined on `URN`, the school's Unique Reference Number.

The checked-in sample in `tmp/` has about 2,340 schools across about 150 local authorities. It was generated around November 2021, so it most likely covers the 2018/19 academic year. That is the last year with published KS4 results before the COVID gap.

Some result columns use placeholder codes instead of numbers: `NP` (not published, e.g. Progress 8 for independent schools), `SUPP` (suppressed because the cohort is too small), `NE` (no entries) and `NEW` (new school with no results yet).

## Architecture

The pipeline has two steps. Each step writes a CSV:

```
DfE performance zip
        │
        │  to_sqlite.sh  (bash + unzip + sqlite3)
        ▼
/tmp/schools_performance.sqlite   ← every CSV in the zip, one table each
        │
        │  SQL join/filter (inside to_sqlite.sh)
        ▼
tmp/schools_performance.csv       ← raw DfE column names and values
        │
        │  yarn optimize_csv  (src/optimize.ts, TypeScript via ts-node)
        ▼
tmp/optimized_schools_performance.csv  ← friendly column names, cleaned values
        │
        ▼
  (planned) map UI
```

### 1. `to_sqlite.sh`: zip → SQLite → CSV

```bash
./to_sqlite.sh path/to/performance-tables.zip
```

- Lists every `.csv` in the zip and streams each one into a fresh SQLite database at `/tmp/schools_performance.sqlite`. The table name is the file name with `-` replaced by `_`.
- Runs one query that left-joins school information to KS4 results and filters to schools where:
  - `ISSECONDARY = 1`
  - `AGEHIGH = 18` (has a sixth form)
  - `SCHSTATUS = 'Open'`
- Writes the result, with headers, to `tmp/schools_performance.csv`.

Requires `unzip` and `sqlite3` on the `PATH`. The script must be run from the project root because the output path is relative.

### 2. `src/optimize.ts`: clean and rename

```bash
yarn install
yarn optimize_csv
```

The script reads `tmp/schools_performance.csv` with `csv-parse`. Each row is converted to a `SchoolPerformance` record by `convertFromRaw`, which is imported from `src/school_performance.ts`. The records are then written to `tmp/optimized_schools_performance.csv` with `csv-stringify`.

The mapping, as shown by the two CSVs in `tmp/`:

| Raw column (DfE)    | Output column           | Meaning                                         | Cleaning                     |
| ------------------- | ----------------------- | ----------------------------------------------- | ---------------------------- |
| `LANAME`            | `locality`              | Local authority name                            |                              |
| `SCHNAME`           | `schoolName`            | School name                                     |                              |
| `TOWN`              | `town`                  | Town                                            |                              |
| `POSTCODE`          | `postalCode`            | Postcode (for geocoding onto a map)             |                              |
| `EGENDER`           | `gender`                | `BOYS` / `GIRLS` / `MIXED`                      |                              |
| `AGERANGE`          | `ageRange`              | e.g. `11-18`                                    |                              |
| `RELDENOM`          | `religionsDenomination` | Religious character                             |                              |
| `TOTPUPS`           | `totalPupils`           | Number of pupils on roll                        | Parsed as a number (`NEW` → `NaN`) |
| `ATT8SCR`           | `attainment8`           | Average Attainment 8 score                      | Placeholder codes → empty |
| `P8MEA`             | `progress8`             | Progress 8 score                                | Placeholder codes → empty |
| `EBACCAPS`          | `ebacAverage`           | Average EBacc point score                       | Placeholder codes → empty |
| `PTEBACC_E_PTQ_EE`  | `enteringEbacPercentage`| % of pupils entering the EBacc                  | `%` removed, parsed as a number (codes → `NaN`) |

`decimal.js` is listed as a dependency, probably for parsing these numeric values exactly.

Known quirk: the original conversion didn't handle placeholder codes in `totalPupils` or `enteringEbacPercentage`. About 350 rows in the optimized CSV contain `NaN` in those columns. A rewrite should map the codes to empty values, as it already does for the score columns.

> ⚠️ **`src/school_performance.ts` is missing.** It was staged in git as an empty file and has since been deleted from the working tree, so `yarn optimize_csv` won't compile right now. It needs to be rewritten. It should export a `SchoolPerformance` type and a `convertFromRaw(record)` function that implements the mapping above. `tmp/optimized_schools_performance.csv` is the last output from the original version and shows the expected result.

## Project layout

```
.
├── to_sqlite.sh        # Step 1: DfE zip → SQLite → tmp/schools_performance.csv
├── src/
│   └── optimize.ts     # Step 2: raw CSV → tmp/optimized_schools_performance.csv
├── tmp/                # Generated CSVs (git-ignored)
├── package.json        # Scripts and dependencies (yarn)
└── tsconfig.json       # strict TypeScript, ES2021, CommonJS
```

## Tech stack

- **Bash**, **unzip** and **sqlite3** for import and filtering
- **TypeScript 4.4**, run directly with **ts-node** (no build step)
- **csv-parse** / **csv-stringify** for CSV input and output
- **decimal.js** for numeric handling
- **yarn** as the package manager

## Status and next steps

The project dates from November 2021. The git history has a single `initial` commit, and most files are only staged.

- [ ] Rewrite `src/school_performance.ts` (see above)
- [ ] Geocode postcodes to lat/long, e.g. with [postcodes.io](https://postcodes.io) or the ONS Postcode Directory
- [ ] Build the map UI described in `package.json` (e.g. Leaflet, colouring markers by Progress 8)
- [ ] Optionally re-run against a newer year of performance tables

## Related

`~/syncthing/code/nodejs/house_data` uses the same DfE school data and combines it with crime and other data to score areas for house hunting.
