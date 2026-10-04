// The shortlist comparison (secondary schools): shortlisting from popups, the comparison dialog and everything in it,
// shared and saved links, and the phone layout. The primary comparison (#49) should extend these and reuse the helpers.
import { anIndependent, beatenTrio, comparableSecondary, selectiveSecondary } from './support/data.ts';
import { expect, test } from './support/fixtures.ts';
import type { Locator } from '@playwright/test';

// Unticks every counted measure (the list shrinks as boxes are cleared, so always take the first)
async function untickAll(dialog: Locator) {
  const ticked = dialog.locator('input[data-count]:checked');
  while ((await ticked.count()) > 0) await ticked.first().uncheck();
}

const trio = comparableSecondary();
const names = (schools: { name: string }[]) => schools.map((s) => s.name);

test.describe('the shortlist', () => {
  test('starts hidden, then lists the schools added from popups, with Compare enabled from two', async ({ explorer }) => {
    await explorer.open();
    await expect(explorer.shortlist).toBeHidden();

    await explorer.clickDot(trio[0]);
    await explorer.detailsLoaded();
    await explorer.addToShortlist();
    await expect(explorer.shortlist.getByRole('heading', { name: 'Shortlist (1 of 6)' })).toBeVisible();
    await expect(explorer.shortlist.getByRole('button', { name: 'Compare' })).toBeDisabled();
    await expect(explorer.shortlist).toContainText('Add at least two schools');

    await explorer.clickDot(trio[1]);
    await explorer.detailsLoaded();
    await explorer.addToShortlist();
    await expect(explorer.shortlist.getByRole('heading', { name: 'Shortlist (2 of 6)' })).toBeVisible();
    await expect(explorer.shortlist.getByRole('button', { name: 'Compare' })).toBeEnabled();
    expect(await explorer.shortlistNames()).toEqual(names(trio.slice(0, 2)));
  });

  test('the popup button toggles, and the panel’s ✕ removes a school', async ({ explorer }) => {
    await explorer.open();
    await explorer.shortlistSchools(trio.slice(0, 2));
    // The open popup's button now offers to remove
    await explorer.popup.getByRole('button', { name: 'Remove from shortlist' }).click();
    await expect(explorer.popup.getByRole('button', { name: 'Add to shortlist' })).toBeVisible();
    expect(await explorer.shortlistNames()).toEqual([trio[0].name]);

    await explorer.shortlist.getByRole('button', { name: `Remove ${trio[0].name} from the shortlist` }).click();
    await expect(explorer.shortlist).toBeHidden();
  });

  test('survives a reload (localStorage)', async ({ explorer, page }) => {
    await explorer.open();
    await explorer.shortlistSchools(trio);
    await page.reload();
    await explorer.ready();
    await expect(explorer.shortlist.getByRole('heading', { name: 'Shortlist (3 of 6)' })).toBeVisible();
    expect(await explorer.shortlistNames()).toEqual(names(trio));
    expect(await page.evaluate(() => localStorage.getItem('schools-shortlist'))).toBe(trio.map((s) => s.urn).join(','));
  });

  test('"Show on map" keeps only the shortlisted schools and puts them in the address', async ({ explorer, page }) => {
    await explorer.open();
    await explorer.shortlistSchools(trio);
    await explorer.shortlist.getByRole('button', { name: 'Show on map' }).click();
    await expect(page.locator('#focus').getByRole('button', { name: 'Clear shortlist filter' })).toContainText('Shortlist: 3 schools');
    await expect.poll(() => explorer.dotCount()).toBe(3);
    await expect.poll(() => explorer.query().get('compare')).toBe(trio.map((s) => s.urn).join(','));
  });

  test('independent schools cannot be shortlisted, and say why', async ({ explorer }) => {
    const independent = anIndependent();
    await explorer.open(`urn=${independent.urn}`);
    await explorer.detailsLoaded();
    await expect(explorer.popup).toContainText('Independent schools publish no GCSE or Progress 8 figures here');
    await expect(explorer.popup.getByRole('button', { name: 'Add to shortlist' })).toHaveCount(0);
  });

  test('holds at most six schools', async ({ explorer }) => {
    await explorer.open();
    await explorer.shortlistSchools(trio.slice(0, 2));
    // "Add schools similar to ..." fills the list from the comparison
    await explorer.openComparison();
    await explorer.comparison.getByRole('button', { name: new RegExp(`^Add schools similar to ${trio[0].name}$`) }).click();
    await expect(explorer.shortlist.getByRole('heading', { name: /^Shortlist \(\d of 6\)$/ })).toBeVisible();
    expect((await explorer.shortlistNames()).length).toBeGreaterThan(2);
    expect((await explorer.shortlistNames()).length).toBeLessThanOrEqual(6);
    // The dialog redraws for the longer list
    await expect(explorer.comparison.getByRole('heading', { level: 2 })).toHaveText(/^Comparing \d schools$/);
  });
});

test.describe('the comparison of three schools', () => {
  test.beforeEach(async ({ explorer }) => {
    await explorer.open();
    await explorer.shortlistSchools(trio);
  });

  test('shows the table with a column per school, the group headings and a verdict on each row', async ({ explorer }) => {
    const dialog = await explorer.openComparison();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Comparing 3 schools');
    for (const h of ['The figures', 'Head to head', 'Beaten on every measure?', 'What matters to you', 'Like with like', 'Applying: equal preference', 'How far to trust this']) {
      await expect(dialog.getByRole('heading', { level: 3, name: h })).toBeVisible();
    }

    const table = dialog.getByRole('table').first();
    // Measure + three schools + two England averages
    const headings = table.locator('thead th');
    await expect(headings).toHaveCount(6);
    for (const s of trio) await expect(headings.filter({ hasText: s.name })).toHaveCount(1);
    await expect(headings.filter({ hasText: 'England average, state-funded schools' })).toHaveCount(1);
    await expect(headings.filter({ hasText: 'England average, all schools' })).toHaveCount(1);

    // The groups, then rows inside them
    for (const g of ['School effect (allowing for intake)', 'Results of pupils at this school', 'Attendance and behaviour', 'Inspection', 'For context (no verdict)']) {
      await expect(table.locator('tr.cmp-group').filter({ hasText: g })).toHaveCount(1);
    }
    for (const row of ['Progress 8', 'Results vs intake', 'Attainment 8', 'Persistent absence', 'Ofsted']) {
      await expect(table.getByRole('rowheader', { name: new RegExp(`^${row}`) })).toHaveCount(1);
    }
    // 95% ranges and verdict wording are in the cells
    await expect(table).toContainText('95% range');
    await expect(table).toContainText(/Likely (better|worse|higher|lower)/);
    await expect(table).toContainText('No clear difference from the others');
    // Every row has a value or "No figure" for every school, plus the two averages
    const body = table.locator('tbody tr:not(.cmp-group)');
    expect(await body.count()).toBeGreaterThanOrEqual(8);
    for (const row of await body.all()) await expect(row.locator('td')).toHaveCount(5);
  });

  test('the head-to-head grid has a cell for each pair, and a tap gives the probability', async ({ explorer }) => {
    const dialog = await explorer.openComparison();
    const grid = dialog.locator('table.cmp-matrix');
    await expect(grid.locator('thead th')).toHaveCount(4);
    await expect(grid.locator('tbody tr')).toHaveCount(3);
    // The diagonal is blank, every other cell is a verdict button
    await expect(grid.locator('td.cmp-self')).toHaveCount(3);
    await expect(grid.locator('td button[data-pair]')).toHaveCount(6);
    await expect(grid.locator('button[data-pair]').first()).toHaveText(/Better|Worse|Unclear/);

    const first = grid.locator('button[data-pair]').first();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('#cmp-pair')).toContainText(/\d+%/);
    await expect(dialog.locator('#cmp-pair')).toContainText(trio[0].name);

    // Another measure redraws the grid and clears the sentence
    const select = dialog.locator('#cmp-matrix-measure');
    const options = await select.locator('option').allInnerTexts();
    expect(options).toContain('Progress 8');
    expect(options.length).toBeGreaterThanOrEqual(5);
    await select.selectOption({ label: 'Persistent absence' });
    await expect(select).toHaveValue(/absence/i);
    await expect(dialog.locator('#cmp-pair')).toHaveText('');
    await expect(dialog.locator('table.cmp-matrix button[data-pair]').first()).toHaveAttribute('aria-pressed', 'false');
  });

  test('marks the school that is beaten on every measure', async ({ explorer, page }) => {
    // Three schools chosen from the data so that one is beaten on every measure by another
    const { schools, loser, winner } = beatenTrio();
    await page.evaluate((urns) => localStorage.setItem('schools-shortlist', urns.join(',')), schools.map((s) => s.urn));
    await page.reload();
    await explorer.ready();
    const dialog = await explorer.openComparison();
    const beaten = dialog.locator('#cmp-beaten');
    await expect(beaten.locator('li').filter({ hasText: `${loser.name} is beaten on every measure by ${winner.name}` })).toBeVisible();
    await expect(beaten).toContainText('where your priorities decide');
    await expect(beaten).toContainText('Measures counted: Progress 8');

    // Unticking measures changes what is counted; with none ticked it says so
    await untickAll(dialog);
    await expect(beaten).toContainText('Tick at least one measure below.');
  });

  test('says no school is beaten when each is ahead somewhere', async ({ explorer, page }) => {
    // Only Ofsted counted: two schools tie on a grade, so nobody is beaten on every measure
    const dialog = await explorer.openComparison();
    await untickAll(dialog);
    await dialog.locator('input[data-count="absence"]').check();
    await expect(dialog.locator('#cmp-beaten')).not.toContainText('Tick at least one measure');
    await expect(page.locator('#cmp-beaten li, #cmp-beaten p').first()).toBeVisible();
  });

  test('has weights and a suggested order, and the order moves with the weights', async ({ explorer }) => {
    const dialog = await explorer.openComparison();
    const weights = dialog.locator('input[type="range"][data-weight]');
    expect(await weights.count()).toBeGreaterThanOrEqual(6);
    await expect(dialog.locator('input[data-count]:checked')).not.toHaveCount(0);
    // The suggested order: one line per school, best first, with the chance of being strongest and a likely place
    const results = dialog.locator('#cmp-sim .cmp-result');
    await expect(results).toHaveCount(3);
    for (const r of await results.all()) await expect(r).toContainText(/Strongest on your priorities in \d+% of 2000 simulated draws\. Likely place: .* of 3/);
    // A verdict paragraph follows it
    await expect(dialog.locator('#cmp-sim .cmp-rule')).toBeVisible();

    // Weighting only Progress 8 (everything else off) makes the top school the one with the best Progress 8
    await untickAll(dialog);
    await dialog.locator('input[data-count="p8"]').check();
    const first = results.first();
    await expect(first).toContainText(trio[2].name);
    await expect(first).toContainText('Likely place: 1st of 3');

    // Moving a slider updates its number
    const slider = dialog.locator('input[data-weight="p8"]');
    await slider.fill('9');
    await expect(slider.locator('xpath=following-sibling::output')).toHaveText('9');
  });

  test('simulated results are the same every time (fixed seed)', async ({ explorer, page }) => {
    await explorer.openComparison();
    const first = await explorer.simulationText();
    expect(first).toMatch(/\d+%/);

    // Reloading and reopening gives the same text
    await page.reload();
    await explorer.ready();
    await explorer.openComparison();
    expect(await explorer.simulationText()).toBe(first);

    // So does changing a weight and changing it back
    const counted = explorer.comparison.locator('input[data-count="p8"]');
    await counted.uncheck();
    await counted.check();
    await expect.poll(() => explorer.simulationText()).toBe(first);
    const slider = explorer.comparison.locator('input[data-weight="p8"]');
    const original = await slider.inputValue();
    await slider.fill('1');
    await slider.fill(original);
    await expect.poll(() => explorer.simulationText()).toBe(first);
  });

  test('the equal-preference note and the GOV.UK links are there', async ({ explorer }) => {
    const dialog = await explorer.openComparison();
    await expect(dialog).toContainText('list the schools in your true order of preference');
    await expect(dialog).toContainText('every school you list is considered equally');
    const apply = dialog.getByRole('link', { name: /Apply for a secondary school place/ });
    await expect(apply).toHaveAttribute('href', 'https://www.gov.uk/apply-for-secondary-school-place');
    await expect(apply).toHaveAttribute('target', '_blank');
    await expect(dialog.getByRole('link', { name: /Find your council’s admissions page/ })).toHaveAttribute('href', 'https://www.gov.uk/find-local-council');
  });

  test('can estimate where each school might rank in England, on request', async ({ explorer }) => {
    const dialog = await explorer.openComparison();
    await dialog.getByRole('button', { name: 'Estimate where each might rank in England' }).click();
    const out = dialog.locator('#cmp-national');
    await expect(out.locator('li')).toHaveCount(3, { timeout: 20_000 });
    await expect(out).toContainText(/state-funded schools \(10th to 90th percentile of draws/);
    await expect(out).toContainText(/Stable|Not stable/);
    await expect(out).toContainText('Measures used:');
  });

  test('mentions the older Progress 8 year, the independent-of-school caveats and the trust note', async ({ explorer }) => {
    const dialog = await explorer.openComparison();
    await expect(dialog).toContainText('Standard errors allow for chance variation only');
    await expect(dialog).toContainText('Results largely reflect who a school admits');
  });

  test('closes with the Close button and with Escape, and the shortlist is still there', async ({ explorer, page }) => {
    const dialog = await explorer.openComparison();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await explorer.shortlist.getByRole('button', { name: 'Compare' }).click();
    await expect(explorer.comparison).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(explorer.comparison).toBeHidden();
    expect((await explorer.shortlistNames()).length).toBe(3);
  });

  test('removing a school redraws the comparison, and dropping to one closes it', async ({ explorer }) => {
    const dialog = await explorer.openComparison();
    await dialog.getByRole('button', { name: `Remove ${trio[0].name}`, exact: true }).click();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Comparing 2 schools');
    await expect(dialog.locator('table').first().locator('thead th')).toHaveCount(5);
    await dialog.getByRole('button', { name: `Remove ${trio[1].name}`, exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('a school’s name in the table opens its popup on the map', async ({ explorer }) => {
    const dialog = await explorer.openComparison();
    await dialog.getByRole('columnheader', { name: new RegExp(trio[1].name) }).getByRole('button').first().click();
    await expect(dialog).toBeHidden();
    await expect(explorer.popup.getByRole('heading', { level: 3, name: trio[1].name })).toBeVisible();
  });
});

test.describe('selective and non-selective schools together', () => {
  test('warns that raw results are not comparable', async ({ explorer }) => {
    const grammar = selectiveSecondary()[0];
    await explorer.open();
    await explorer.shortlistSchools([grammar, trio[1]]);
    const dialog = await explorer.openComparison();
    await expect(dialog).toContainText('This list mixes selective and non-selective schools');
    await expect(dialog.getByRole('table').first()).toContainText('selective');
  });
});

test.describe('shared and saved links', () => {
  test('Copy link gives a ?compare= link that opens the same comparison for someone else', async ({ explorer, page, browser, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await explorer.open();
    await explorer.shortlistSchools(trio);
    await explorer.shortlist.getByRole('button', { name: 'Copy link' }).click();
    await expect(explorer.shortlist.getByRole('button', { name: 'Link copied' })).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const urns = trio.map((s) => s.urn).join(',');
    expect(new URL(link).searchParams.get('compare')).toBe(urns);
    expect(new URL(link).pathname).toBe('/');

    // A different visitor (no saved shortlist) opens it: the comparison is already showing
    const guest = await browser.newContext({ baseURL: new URL(link).origin });
    const guestPage = await guest.newPage();
    await guestPage.addInitScript(() => ((window as unknown as { __E2E__: boolean }).__E2E__ = true));
    await guestPage.route((u) => u.origin !== new URL(link).origin, (route) => (route.request().url().includes('/styles/') ? route.fulfill({ json: { version: 8, sources: {}, layers: [] } }) : route.abort()));
    await guestPage.goto(link);
    const comparison = guestPage.getByRole('dialog', { name: 'Comparing 3 schools' });
    await expect(comparison).toBeVisible();
    for (const s of trio) await expect(comparison.getByRole('columnheader', { name: s.name, exact: true })).toBeVisible();
    await guest.close();
  });

  test('opening someone’s link does not overwrite my own shortlist, and can be saved on request', async ({ explorer, page }) => {
    // My own shortlist: the first two
    await explorer.open();
    await explorer.shortlistSchools(trio.slice(0, 2));

    // Their link: the second and third
    const theirs = trio.slice(1);
    await page.goto(`/?compare=${theirs.map((s) => s.urn).join(',')}`);
    await explorer.ready();
    await expect(explorer.comparison).toBeVisible();
    await explorer.comparison.getByRole('button', { name: 'Close' }).click();
    await expect(explorer.shortlist.getByRole('heading', { name: 'Shared shortlist (2 of 6)' })).toBeVisible();
    await expect(explorer.shortlist).toContainText('You are viewing a shared shortlist. Your own saved shortlist (2 schools) has not been changed.');
    expect(await page.evaluate(() => localStorage.getItem('schools-shortlist'))).toBe(trio.slice(0, 2).map((s) => s.urn).join(','));

    // Back to mine, then the shared one again and save it
    await explorer.shortlist.getByRole('button', { name: 'Back to mine' }).click();
    expect(await explorer.shortlistNames()).toEqual(names(trio.slice(0, 2)));

    await page.goto(`/?compare=${theirs.map((s) => s.urn).join(',')}`);
    await explorer.ready();
    await explorer.comparison.getByRole('button', { name: 'Close' }).click();
    await explorer.shortlist.getByRole('button', { name: 'Save as my shortlist' }).click();
    expect(await page.evaluate(() => localStorage.getItem('schools-shortlist'))).toBe(theirs.map((s) => s.urn).join(','));
    await expect(explorer.shortlist.getByRole('heading', { name: 'Shortlist (2 of 6)' })).toBeVisible();
  });

  test('a ?compare= link round-trips: its list, in order, is what the panel and the address show', async ({ explorer }) => {
    const reversed = [...trio].reverse();
    await explorer.open(`compare=${reversed.map((s) => s.urn).join(',')}`);
    await expect(explorer.comparison).toBeVisible();
    await explorer.comparison.getByRole('button', { name: 'Close' }).click();
    expect(await explorer.shortlistNames()).toEqual(names(reversed));
    // The shortlist shows on the map and the address keeps the same order
    await expect.poll(() => explorer.query().get('compare')).toBe(reversed.map((s) => s.urn).join(','));
    await expect.poll(() => explorer.dotCount()).toBe(3);
  });

  test('a ?compare= link with one school, or unknown ones, does not open the comparison', async ({ explorer }) => {
    await explorer.open(`compare=${trio[0].urn},1`);
    await expect(explorer.comparison).toHaveCount(0);
    await expect(explorer.shortlist.getByRole('heading', { name: 'Shared shortlist (1 of 6)' })).toBeVisible();
  });
});

test.describe('on a phone (390 px wide)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the table scrolls sideways and the group headings stay in view', async ({ explorer, page }) => {
    await explorer.open();
    await page.evaluate((urns) => localStorage.setItem('schools-shortlist', urns.join(',')), trio.map((s) => s.urn));
    await page.reload();
    await explorer.ready();
    await page.getByRole('button', { name: /Secondary schools in England/ }).click().catch(() => undefined);
    await explorer.shortlist.scrollIntoViewIfNeeded();
    const dialog = await explorer.openComparison();

    const scroller = dialog.locator('.cmp-scroll').first();
    const sizes = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client + 100);

    const heading = dialog.locator('tr.cmp-group .cmp-group-text').first();
    const before = (await heading.boundingBox())!;
    await scroller.evaluate((el) => (el.scrollLeft = 400));
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(200);
    const after = (await heading.boundingBox())!;
    // The heading did not travel with the table: it is still on screen, near where it was, inside the 390 px window
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.x).toBeLessThan(60);
    expect(Math.abs(after.x - before.x)).toBeLessThan(20);
    expect(after.x + Math.min(after.width, 100)).toBeLessThanOrEqual(390);

    // The page itself does not scroll sideways
    expect(await explorer.horizontalScroll).toBe(false);
  });
});
