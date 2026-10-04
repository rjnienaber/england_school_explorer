import { num, readCsvShared, text } from '../../lib/csv.ts';
import { needCode } from './needs.ts';

export interface SenProvision {
  /** What the school has: resourced provision, an SEN unit or both. */
  kind: 'resourced' | 'unit' | 'both';
  /** Need codes in GIAS order, e.g. "ASD,SLCN". Null when GIAS lists none. */
  needs: string | null;
  /** Places in the unit and the resourced provision added together, where either is given. */
  places: number | null;
}

const KINDS: Record<string, SenProvision['kind']> = {
  'Resourced provision': 'resourced',
  'SEN unit': 'unit',
  'Resourced provision and SEN unit': 'both',
};

/** Schools whose GIAS row says they have resourced provision or an SEN unit, by URN. */
export async function loadSenProvision(file: string): Promise<Map<number, SenProvision>> {
  const out = new Map<number, SenProvision>();
  // Shared parse: gias-core reads the same file in the same build
  for await (const row of readCsvShared(file, 'windows-1252')) {
    const urn = num(row.URN);
    const kind = KINDS[text(row['TypeOfResourcedProvision (name)']) ?? ''];
    if (urn === null || !kind) continue;
    const codes: string[] = [];
    for (let i = 1; i <= 13; i++) {
      const code = needCode(text(row[`SEN${i} (name)`]));
      if (code && !codes.includes(code)) codes.push(code);
    }
    const caps = [num(row.ResourcedProvisionCapacity), num(row.SenUnitCapacity)].filter((c): c is number => c !== null && c > 0);
    out.set(urn, { kind, needs: codes.join(',') || null, places: caps.length ? caps.reduce((a, b) => a + b, 0) : null });
  }
  return out;
}
