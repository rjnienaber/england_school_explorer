// The shortlist comparison for primary schools (?phase=primary): its own shortlist and link, the KS2 measures, the two
// plain-wording caveats, and the sections that secondary has and primary does not. The secondary comparison is in compare.spec.ts.
import { comparablePrimary, primaryWithoutCohort, primaryWithoutResults } from './support/data.ts';
import { expect, test } from './support/fixtures.ts';

const trio = comparablePrimary();
const urns = trio.map((s) => s.urn).join(',');
const names = (schools: { name: string }[]) => schools.map((s) => s.name);

test.describe('the primary shortlist', () => {
  test('is saved under its own key and does not touch the secondary one', async ({ explorer, page }) => {
    await page.addInitScript(() => localStorage.getItem('schools-shortlist') ?? localStorage.setItem('schools-shortlist', '1'));
    await explorer.open('phase=primary');
    await expect(explorer.shortlist).toBeHidden();
    await explorer.shortlistSchools(trio.slice(0, 2));
    await expect(explorer.shortlist.getByRole('heading', { name: 'Shortlist (2 of 6)' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('schools-shortlist-primary'))).toBe(trio.slice(0, 2).map((s) => s.urn).join(','));
    // Whatever secondary had is untouched
    expect(await page.evaluate(() => localStorage.getItem('schools-shortlist'))).toBe('1');
    await page.reload();
    await explorer.ready();
    expect(await explorer.shortlistNames()).toEqual(names(trio.slice(0, 2)));
  });

  test('secondary has no sign of the primary list, and the other way round', async ({ explorer, page }) => {
    await page.addInitScript((value) => localStorage.setItem('schools-shortlist-primary', value), urns);
    await explorer.open();
    await expect(explorer.shortlist).toBeHidden();
    await explorer.open('phase=primary');
    expect(await explorer.shortlistNames()).toEqual(names(trio));
  });

  test('"Show on map" keeps the shortlisted schools and puts the phase in the address', async ({ explorer, page }) => {
    await explorer.open('phase=primary');
    await explorer.shortlistSchools(trio.slice(0, 2));
    await explorer.shortlist.getByRole('button', { name: 'Show on map' }).click();
    await expect(page.locator('#focus').getByRole('button', { name: 'Clear shortlist filter' })).toContainText('Shortlist: 2 schools');
    await expect.poll(() => explorer.dotCount()).toBe(2);
    await expect.poll(() => explorer.query().get('compare')).toBe(trio.slice(0, 2).map((s) => s.urn).join(','));
    expect(explorer.query().get('phase')).toBe('primary');
  });

  test('Copy link carries the phase, and the link opens the same comparison', async ({ explorer, page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await explorer.open('phase=primary');
    await explorer.shortlistSchools(trio);
    await explorer.shortlist.getByRole('button', { name: 'Copy link' }).click();
    await expect(explorer.shortlist.getByRole('button', { name: 'Link copied' })).toBeVisible();
    const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(link.searchParams.get('compare')).toBe(urns);
    expect(link.searchParams.get('phase')).toBe('primary');

    await page.evaluate(() => localStorage.clear());
    await page.goto(`${link.pathname}${link.search}`);
    await explorer.ready();
    await expect(explorer.comparison).toBeVisible();
    for (const s of trio) await expect(explorer.comparison.getByRole('columnheader', { name: s.name, exact: true })).toBeVisible();
  });

  test('a ?compare= link without a phase is a secondary one', async ({ explorer }) => {
    await explorer.open(`compare=${urns}`);
    // These are primary URNs, so none is a known secondary school: nothing to compare
    await expect(explorer.comparison).toHaveCount(0);
    await expect(explorer.phase('Secondary')).toBeChecked();
  });
});

test.describe('the comparison of three primary schools', () => {
  test.beforeEach(async ({ explorer }) => {
    await explorer.open(`phase=primary&compare=${urns}`);
    await expect(explorer.comparison).toBeVisible();
    await expect(explorer.comparison.getByRole('table').first()).toBeVisible();
    await expect(explorer.comparison.locator('#cmp-sim .cmp-result').first()).toBeVisible();
  });

  test('says the two caveats in plain words before any figures, and the research caveat at the end', async ({ explorer }) => {
    const dialog = explorer.comparison;
    const caveats = dialog.locator('.cmp-caveats');
    await expect(caveats).toContainText('KS2 results mostly reflect who joins the school, not only teaching.');
    await expect(caveats).toContainText('There’s no up-to-date measure that adjusts for intake.');
    await expect(caveats).toContainText('Year 6 groups are small, often around 30 pupils');
    await expect(caveats).toContainText('Expect “no clear difference” often.');
    // The caveats come before the table
    const before = await caveats.evaluate((el) => !!(el.compareDocumentPosition(document.querySelector('.cmp-table')!) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(before).toBe(true);
    await expect(dialog).toContainText('Leckie and Goldstein, 2017');
    await expect(dialog).toContainText('last published it for 2022/23');
  });

  test('shows the KS2 measures with ranges, one England average column and context rows', async ({ explorer }) => {
    const table = explorer.comparison.getByRole('table').first();
    // Measure + three schools + one England average
    await expect(table.locator('thead th')).toHaveCount(5);
    await expect(table.locator('thead th').filter({ hasText: 'England average, state-funded schools' })).toHaveCount(1);
    await expect(table.locator('thead th').filter({ hasText: 'England average, all schools' })).toHaveCount(0);
    for (const row of ['Reading, writing and maths: expected standard', 'Reading, writing and maths: higher standard', 'Persistent absence']) {
      await expect(table.getByRole('rowheader', { name: new RegExp(`^${row}`) })).toHaveCount(1);
    }
    await expect(table.locator('tr.cmp-group').filter({ hasText: 'Results of pupils at this school' })).toHaveCount(1);
    await expect(table.locator('tr.cmp-group').filter({ hasText: 'For context (no verdict)' })).toHaveCount(1);
    await expect(table.getByRole('rowheader', { name: /^Pupils who took the KS2 tests/ })).toHaveCount(1);
    await expect(table.getByRole('rowheader', { name: /^Reading: average scaled score/ })).toHaveCount(1);
    await expect(table).toContainText('95% range');
    // Results are described as results, not as quality
    await expect(table).toContainText(/Likely higher results|Likely lower results/);
    for (const name of ['Reading, writing and maths: expected standard', 'Reading, writing and maths: higher standard']) {
      await expect(table.getByRole('row', { name: new RegExp(`^${name}`) })).not.toContainText(/better|worse|best school/i);
    }
    // Only the intake-adjusted progress rows may say "progress" about a school
    await expect(table.getByRole('row', { name: /^Reading progress/ })).toContainText(/No clear difference|Likely (better|worse) progress/);
    // Not secondary's rows
    await expect(table.getByRole('rowheader', { name: /^Progress 8/ })).toHaveCount(0);
    await expect(table.getByRole('rowheader', { name: /^Suspensions per 100/ })).toHaveCount(0);
    // Every row has a cell for each school and the average
    for (const row of await table.locator('tbody tr:not(.cmp-group)').all()) await expect(row.locator('td')).toHaveCount(4);
  });

  test('progress is labelled as the last year published, when a school has it', async ({ explorer }) => {
    const table = explorer.comparison.getByRole('table').first();
    const progress = table.locator('tr.cmp-group').filter({ hasText: 'Progress from age 7' });
    // Some primaries (new ones, or any school without 2022/23 data) have none, so only check the wording when it is shown
    if ((await progress.count()) > 0) {
      await expect(progress).toContainText('2022/23, the last year published');
      await expect(table.getByRole('rowheader', { name: /^Reading progress/ })).toContainText('2022/23');
    }
  });

  test('has the head-to-head grid on KS2 measures', async ({ explorer }) => {
    const dialog = explorer.comparison;
    const grid = dialog.locator('table.cmp-matrix');
    await expect(grid.locator('td button[data-pair]')).toHaveCount(6);
    const select = dialog.locator('#cmp-matrix-measure');
    await expect(select).toHaveValue('rwmExpected');
    expect(await select.locator('option').allInnerTexts()).toContain('Reading, writing and maths: expected standard');
    await grid.locator('button[data-pair]').first().click();
    await expect(dialog.locator('#cmp-pair')).toContainText(/\d+%/);
    await expect(dialog.locator('#cmp-pair')).toContainText('The odds allow only for chance variation');
  });

  test('has the beaten check, weights and the suggested order on KS2 measures', async ({ explorer }) => {
    const dialog = explorer.comparison;
    await expect(dialog.getByRole('heading', { level: 3, name: 'Beaten on every measure?' })).toBeVisible();
    await expect(dialog.locator('#cmp-beaten')).toContainText('Measures counted: Reading, writing and maths: expected standard');
    await expect(dialog.locator('input[type="range"][data-weight]')).not.toHaveCount(0);
    await expect(dialog.locator('input[data-weight="p8"]')).toHaveCount(0);
    const results = dialog.locator('#cmp-sim .cmp-result');
    await expect(results).toHaveCount(3);
    for (const r of await results.all()) await expect(r).toContainText(/Strongest on your priorities in \d+% of 2000 simulated draws\. Likely place: .* of 3/);
    // Counting only the expected standard puts the school with the highest result first
    const ticked = dialog.locator('input[data-count]:checked');
    while ((await ticked.count()) > 0) await ticked.first().uncheck();
    await dialog.locator('input[data-count="rwmExpected"]').check();
    await expect(results.first()).toContainText(trio[2].name);
  });

  test('leaves out the national rank estimate and the like-with-like prompt, with no empty headings', async ({ explorer }) => {
    const dialog = explorer.comparison;
    await expect(dialog.getByRole('button', { name: 'Estimate where each might rank in England' })).toHaveCount(0);
    await expect(dialog.locator('#cmp-national')).toHaveCount(0);
    await expect(dialog.getByRole('heading', { level: 3, name: 'Like with like' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Add schools similar to/ })).toHaveCount(0);
    for (const h of await dialog.getByRole('heading', { level: 3 }).all()) {
      const empty = await h.evaluate((el) => {
        let next = el.nextElementSibling;
        while (next && next.tagName !== 'H3') {
          if ((next as HTMLElement).innerText.trim()) return false;
          next = next.nextElementSibling;
        }
        return true;
      });
      expect(empty, `section "${await h.innerText()}" is empty`).toBe(false);
    }
  });

  test('the equal-preference note links to the primary application page', async ({ explorer }) => {
    const dialog = explorer.comparison;
    await expect(dialog).toContainText('list the schools in your true order of preference');
    const apply = dialog.getByRole('link', { name: /Apply for a primary school place/ });
    await expect(apply).toHaveAttribute('href', 'https://www.gov.uk/apply-for-primary-school-place');
    await expect(dialog.getByRole('link', { name: /Apply for a secondary school place/ })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: /Find your council’s admissions page/ })).toHaveAttribute('href', 'https://www.gov.uk/find-local-council');
  });

  test('simulated results are the same every time (fixed seed)', async ({ explorer, page }) => {
    const first = await explorer.simulationText();
    expect(first).toMatch(/\d+%/);
    await page.reload();
    await explorer.ready();
    await expect(explorer.comparison).toBeVisible();
    await expect(explorer.comparison.locator('#cmp-sim .cmp-result').first()).toBeVisible();
    expect(await explorer.simulationText()).toBe(first);
  });
});

test.describe('primary schools with missing figures', () => {
  test('a school with no KS2 results is named and left out of the results rows', async ({ explorer }) => {
    const none = primaryWithoutResults();
    await explorer.open(`phase=primary&compare=${trio[0].urn},${trio[1].urn},${none.urn}`);
    const dialog = explorer.comparison;
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.cmp-notice')).toContainText(`No KS2 results are published for ${none.name}`);
    const row = dialog.getByRole('table').first().getByRole('row', { name: /^Reading, writing and maths: expected standard/ });
    await expect(row.locator('td').nth(2)).toHaveText('No figure');
  });

  test('a school with no year group size shows its figure with no range and takes no part in verdicts', async ({ explorer }) => {
    const odd = primaryWithoutCohort();
    test.skip(!odd, 'every school with KS2 results in this build has a year group size');
    await explorer.open(`phase=primary&compare=${trio[0].urn},${trio[1].urn},${odd!.school.urn}`);
    const dialog = explorer.comparison;
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.cmp-notice')).toContainText(`The size of the Year 6 group is not published for ${odd!.school.name}`);
    const row = dialog.getByRole('table').first().getByRole('row', { name: /^Reading, writing and maths: expected standard/ });
    const cell = row.locator('td').nth(2);
    await expect(cell).toContainText(`${odd!.expected}%`);
    await expect(cell).toContainText('Year group size not published: no range');
    await expect(cell).not.toContainText('95% range');
    await expect(cell).not.toContainText(/Likely|No clear difference/);
    // The head-to-head grid has no verdict for it either
    const grid = dialog.locator('table.cmp-matrix');
    await expect(grid.locator('tbody tr').nth(2).locator('td.cmp-na')).toHaveCount(2);
  });
});

test.describe('on a phone (390 px wide)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the primary table scrolls sideways and the page does not', async ({ explorer }) => {
    await explorer.open(`phase=primary&compare=${urns}`);
    const dialog = explorer.comparison;
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('table').first()).toBeVisible();
    const sizes = await dialog.locator('.cmp-scroll').first().evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client + 50);
    expect(await explorer.horizontalScroll).toBe(false);
  });
});
