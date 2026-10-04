import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ciChart, formatDate, h, html, median, ordinal, quintile, raw, rows, signed, table } from './toolkit.ts';

test('html escapes interpolated text but not nested Html', () => {
  const name = '<img src=x onerror=alert(1)> & "co"';
  assert.equal(html`<b>${name}</b>`.value, '<b>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;co&quot;</b>');
  assert.equal(html`<p>${html`<i>${'a&b'}</i>`}</p>`.value, '<p><i>a&amp;b</i></p>');
  assert.equal(html`${raw('<br>')}${null}${false}${[1, 'x<']}`.value, '<br>1x&lt;');
});

test('rows skips falsy entries and shows a dash for null', () => {
  const out = rows([['A', '1'], false, ['B', null], ['C <c>', 'x']]).value;
  assert.equal((out.match(/<tr>/g) ?? []).length, 3);
  assert.ok(out.includes('<td>–</td>'));
  assert.ok(out.includes('C &lt;c&gt;'));
});

test('number helpers', () => {
  assert.equal(ordinal(1), '1st');
  assert.equal(ordinal(12), '12th');
  assert.equal(ordinal(23), '23rd');
  assert.equal(signed(-0.2, 2), '−0.20');
  assert.equal(signed(1.5, 1), '+1.5');
  assert.equal(quintile(0), 4);
  assert.equal(quintile(100), 0);
  assert.equal(quintile(null), null);
  assert.equal(formatDate(null), '');
  assert.ok(h.fmt(null) === '–');
});

test('ciChart clamps to the axis and describes the interval', () => {
  const svg = ciChart({ value: 5, lower: -5, upper: 9, min: -1.5, max: 1.5, name: 'Progress 8', zeroLabel: 'zero' }).value;
  assert.ok(svg.includes('aria-label="Progress 8 +5.00, 95% confidence interval −5.00 to +9.00"'));
  assert.ok(svg.includes('x1="4"') && svg.includes('x2="256"'));
});

test('table: label column, right-hand cells, skipped falsy rows and escaped text', () => {
  const out = table(['Group', 'N'], [['A <a>', 3], false, ['B', null]]).value;
  assert.match(out, /<thead><tr><th>Group<\/th><th>N<\/th><\/tr><\/thead>/);
  assert.match(out, /<tr><th>A &lt;a&gt;<\/th><td>3<\/td><\/tr>/);
  assert.match(out, /<tr><th>B<\/th><td>–<\/td><\/tr>/);
  assert.equal(out.match(/<tbody>/g)?.length, 1);
});

test('median and filterButton', () => {
  assert.equal(median([3, null, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([null]), null);
  const out = h.filterButton('trust', '1"x', 'See <all>').value;
  assert.equal(out, '<button type="button" class="link-button" data-set-filter="trust" data-value="1&quot;x">See &lt;all&gt;</button>');
});
