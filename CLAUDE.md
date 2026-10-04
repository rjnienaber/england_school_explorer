# Secondary School Map

Before adding or changing data (a new measure, source, colour mode, filter or popup section),
read `docs/adding-a-dimension.md`. Each kind of data is a self-contained folder in
`dimensions/<id>/`; a new dimension should not need edits outside its folder.

Checks before committing: `npm run typecheck`, `npm test` and `npm run build`. Never commit
`data/`, `build/`, `release/`, `dist/` or `web/generated/`.
