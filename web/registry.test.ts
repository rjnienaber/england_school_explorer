import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FILTERS, MODES, POPUP_SECTIONS, POPUP_TAGS, SOURCE_NOTES, modeById } from './registry.ts';
import { PALETTES } from './palette.ts';

test('ids are unique and lists are sorted by order', () => {
  for (const list of [MODES, FILTERS, POPUP_SECTIONS, POPUP_TAGS, SOURCE_NOTES]) {
    assert.equal(new Set(list.map((x) => x.id)).size, list.length);
    const orders = list.map((x) => x.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  }
});

test('the default mode is the lowest order, and an unknown id falls back to it', () => {
  assert.equal(MODES[0].id, 'p8');
  assert.equal(modeById('nonsense'), MODES[0]);
  assert.deepEqual(MODES.map((m) => m.id), ['p8', 'intake', 'att8', 'ofsted']);
});

test('every bucket points at a colour in the palette', () => {
  for (const m of MODES) {
    const size = PALETTES[m.palette ?? 'diverging'].light.length;
    for (const b of m.buckets) assert.ok(b.colour >= 0 && b.colour < size, `${m.id}: ${b.label}`);
  }
});

test('every filter default is valid for its control', () => {
  for (const f of FILTERS) {
    if (f.control.kind === 'checkbox') assert.equal(typeof f.default, 'boolean');
    else assert.ok(f.control.options.some((o) => o.value === f.default), f.id);
  }
});
