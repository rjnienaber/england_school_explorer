// Reads the built data (dist/data/) in Node, so tests can choose schools that exist in whatever build they run against
// rather than hard-coding URNs that a monthly refresh might drop.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { columnPath, decodeColumn, decodeUrns, shardOf, shardPath, type ColumnFile, type CoreFile, type DetailFile, type Value } from '../../lib/columnar.ts';
import { MEASURES } from '../../dimensions/compare/measures.ts';
import { beatenBy, type Profile } from '../../dimensions/compare/stats.ts';
import type { Metadata, School } from '../../web/toolkit.ts';
import { phaseDir, type Phase } from '../../lib/phase.ts';

export interface CoreSchool {
  urn: number;
  lng: number;
  lat: number;
  name: string;
  la: string;
  sector: string;
  selective: boolean;
  /** Progress 8, or null (secondary only). */
  p8: number | null;
  /** Every other core column, by field name. */
  [field: string]: unknown;
}

const cache = new Map<Phase, { core: CoreFile; schools: CoreSchool[] }>();

export function loadBuiltCore(phase: Phase = 'secondary'): { core: CoreFile; schools: CoreSchool[] } {
  let hit = cache.get(phase);
  if (!hit) {
    const core = JSON.parse(readFileSync(join(import.meta.dirname, '../../dist/data', phaseDir(phase), 'core.json'), 'utf8')) as CoreFile;
    const urns = decodeUrns(core);
    const columns = Object.entries(core.columns).map(([name, values]) => [name, decodeColumn(core.fields[name], values)] as const);
    const schools = urns.map((urn, i) => {
      const school: Record<string, unknown> = { urn, lng: core.lng[i], lat: core.lat[i] };
      for (const [name, values] of columns) school[name] = values[i];
      return school as CoreSchool;
    });
    hit = { core, schools };
    cache.set(phase, hit);
  }
  return hit;
}

/** Straight-line distance in metres (good enough at the scale of "are these two dots apart on screen"). */
function metres(a: CoreSchool, b: CoreSchool): number {
  const dy = (a.lat - b.lat) * 111_000;
  const dx = (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Schools with no other school within `gap` metres, so a click on the dot can only mean that school. */
export function isolated(schools: CoreSchool[], gap = 400): CoreSchool[] {
  // A coarse grid keeps this fast: only neighbours in the same or adjacent cells are measured
  const cell = (s: CoreSchool) => [Math.floor(s.lng * 100), Math.floor(s.lat * 100)] as const;
  const grid = new Map<string, CoreSchool[]>();
  for (const s of schools) {
    const [x, y] = cell(s);
    const key = `${x},${y}`;
    grid.set(key, [...(grid.get(key) ?? []), s]);
  }
  return schools.filter((s) => {
    const [x, y] = cell(s);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const o of grid.get(`${x + dx},${y + dy}`) ?? []) if (o !== s && metres(s, o) < gap) return false;
    return true;
  });
}

/**
 * Three state-funded, non-selective schools with a Progress 8 score, far apart from the rest, and spread over the range of
 * results (lowest, middle and highest Progress 8), so a comparison has something to say. The same build always gives the same three.
 */
export function comparableSecondary(): CoreSchool[] {
  const { schools } = loadBuiltCore('secondary');
  const ok = isolated(schools).filter((s) => s.sector === 'state' && !s.selective && s.p8 !== null && /^[\w ,'’&.()-]+$/.test(s.name));
  ok.sort((a, b) => a.p8! - b.p8! || a.urn - b.urn);
  if (ok.length < 20) throw new Error(`Expected many comparable schools in the build, found ${ok.length}`);
  return [ok[Math.floor(ok.length * 0.1)], ok[Math.floor(ok.length / 2)], ok[Math.floor(ok.length * 0.9)]];
}

const DATA_DIR = join(import.meta.dirname, '../../dist/data');

/** One school's detail record (the non-core fields, from its shard). Fields a school has no value for are absent. */
export function detailsOf(phase: Phase, urn: number): Record<string, Value> {
  const { core } = loadBuiltCore(phase);
  const file = JSON.parse(readFileSync(join(DATA_DIR, phaseDir(phase), shardPath(shardOf(urn, core.shards))), 'utf8')) as DetailFile;
  return file.schools[String(urn)] ?? {};
}

/** The values of one `mode` field for every school, in core's order. */
export function modeColumn(phase: Phase, field: string): Value[] {
  const { core } = loadBuiltCore(phase);
  const file = JSON.parse(readFileSync(join(DATA_DIR, phaseDir(phase), columnPath(field)), 'utf8')) as ColumnFile;
  return decodeColumn(core.fields[field], file.values);
}

/** A trust with a handful of open schools in this phase (5 to 20, the lowest id), with its schools. */
export function aTrust(phase: Phase): { id: string; schools: CoreSchool[] } {
  const { schools } = loadBuiltCore(phase);
  const ids = modeColumn(phase, 'trustId');
  const by = new Map<string, CoreSchool[]>();
  ids.forEach((id, i) => id && by.set(String(id), [...(by.get(String(id)) ?? []), schools[i]]));
  const found = [...by.entries()].filter(([, list]) => list.length >= 5 && list.length <= 20).sort((a, b) => Number(a[0]) - Number(b[0]))[0];
  if (!found) throw new Error(`No trust with 5 to 20 ${phase} schools in the build`);
  return { id: found[0], schools: found[1] };
}

/** A comparable secondary school whose "similar schools" list is not empty, for `?similar=` links. */
export function schoolWithSimilar(): { school: CoreSchool; similar: number[] } {
  for (const school of comparableSecondary()) {
    const similar = String(detailsOf('secondary', school.urn).similarUrns ?? '').split(/[-,]/).map(Number).filter(Boolean);
    if (similar.length) return { school, similar };
  }
  throw new Error('None of the comparable schools has similar schools');
}

/** Isolated state-funded selective (grammar) schools with a Progress 8 score. */
export function selectiveSecondary(): CoreSchool[] {
  const { schools } = loadBuiltCore('secondary');
  return isolated(schools).filter((s) => s.sector === 'state' && s.selective && s.p8 !== null).sort((a, b) => a.urn - b.urn);
}

/** An independent school (these publish no results here, so they cannot be shortlisted). */
export function anIndependent(): CoreSchool {
  const found = loadBuiltCore('secondary').schools.find((s) => s.sector === 'independent');
  if (!found) throw new Error('No independent school in the build');
  return found;
}

/** An isolated primary school, for popups that must be clicked from the map. */
export function aPrimary(): CoreSchool {
  const { schools } = loadBuiltCore('primary');
  const found = isolated(schools, 800).find((s) => s.sector === 'state');
  if (!found) throw new Error('No isolated primary school in the build');
  return found;
}

/**
 * Three comparable schools, in this order, where the first is beaten on every measure the comparison counts by default
 * (at least as good everywhere and likely better somewhere) by one of the others. Found with the comparison's own rule
 * (`beatenBy`) over the built data, so the test knows which "beaten on every measure" line must appear without
 * hard-coding schools that a monthly refresh could change.
 */
export function beatenTrio(): { schools: CoreSchool[]; loser: CoreSchool; winner: CoreSchool } {
  const { core } = loadBuiltCore('secondary');
  const meta = core.metadata as unknown as Metadata;
  const ok = isolated(loadBuiltCore('secondary').schools).filter((s) => s.sector === 'state' && !s.selective && s.p8 !== null && /^[\w ,'’&.()-]+$/.test(s.name));
  ok.sort((a, b) => a.p8! - b.p8! || a.urn - b.urn);
  const middle = ok[Math.floor(ok.length / 2)];
  const counted = MEASURES.filter((m) => m.byDefault);
  const profile = (s: CoreSchool): Profile => {
    const record = { ...s, ...detailsOf('secondary', s.urn) } as unknown as School;
    return { id: s.urn, readings: counted.map((m) => m.reading(record, meta)) };
  };
  const lows = ok.slice(0, 40);
  const highs = ok.slice(-40).reverse();
  for (const winner of highs) {
    for (const loser of lows) {
      const trio = [loser, middle, winner];
      const beaten = beatenBy(trio.map(profile), counted.map((m) => m.higherIsBetter));
      // Which school the page names is the first that beats it, in list order
      if (beaten[0] !== null) return { schools: trio, loser, winner: trio.find((s) => s.urn === beaten[0])! };
    }
  }
  throw new Error('No school in the build is beaten on every measure by another: cannot test that marker');
}
