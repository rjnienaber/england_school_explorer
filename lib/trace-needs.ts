// Finds which fields each mode, filter and popup piece reads, so the browser knows what to
// download before using them. Authors don't declare this: every function is run over every
// school with a Proxy that records the properties it touches. Running it over the real data
// (not a guess at it) means every branch the data can reach is covered, e.g. a popup section
// that only reads Ofsted report-card grades for schools that have one.

import type { Needs } from './columnar.ts';
import type { Phase } from './phase.ts';

type Record_ = Record<string, unknown>;

/** Runs `fn` over every record and returns the sorted field names it read (never `urn`). */
export function trace(records: Record_[], fieldNames: Set<string>, fn: (p: never) => unknown): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    const proxy = new Proxy(record, {
      get(target, key) {
        if (typeof key === 'string' && fieldNames.has(key)) seen.add(key);
        return target[key as string];
      },
    });
    fn(proxy as never);
  }
  return [...seen].sort();
}

const union = (...lists: string[][]) => [...new Set(lists.flat())].sort();

/**
 * `records` are complete (every field present, nulls and defaults filled in), exactly as the
 * browser sees a school once everything is loaded. Imports the web registry lazily because
 * it needs web/generated/registry.ts to exist first.
 */
export async function traceNeeds(records: Record_[], fieldNames: string[], phase: Phase = 'secondary'): Promise<Needs> {
  const { MODES, FILTERS } = (await import('../web/registry.ts')).registryFor(phase);
  const { h } = await import('../web/toolkit.ts');
  const PIECES = (await import('../web/popup.ts')).piecesFor(phase);
  const names = new Set(fieldNames);
  const t = (fn: (p: never) => unknown) => trace(records, names, fn);

  const needs: Needs = { modes: {}, filters: {}, popup: {} };
  for (const m of MODES) {
    needs.modes[m.id] = union(t(m.bucketOf as never), t(m.sortValue as never), t(m.formatValue as never));
  }
  for (const f of FILTERS) {
    // A test that short-circuits (`!on || p.x`) only reads fields for some values, so trace each
    if (f.control.kind === 'chip') {
      // A focus filter has no fixed values: '' (off) and '*' (any value). Its chip text and summary are loaded with it.
      const { chipText, summary } = f.control;
      const test = f.test as (p: never, v: string) => boolean;
      const show = (p: never) => {
        chipText([p as never], 'x');
        summary?.([p as never], 'x', h);
      };
      needs.filters[f.id] = { '': t((p: never) => test(p, '')), '*': union(t((p: never) => test(p, 'x')), t(show)) };
      continue;
    }
    const values = f.control.kind === 'checkbox' ? [true, false] : f.control.options.map((o) => o.value);
    needs.filters[f.id] = {};
    for (const value of values) {
      needs.filters[f.id][String(value)] = t(((p: never) => (f.test as (p: never, v: unknown) => boolean)(p, value)) as never);
    }
  }
  for (const piece of PIECES) needs.popup[piece.id] = t(piece.html as never);
  return needs;
}
