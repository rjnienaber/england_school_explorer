// Links that open the page in a particular state: ?trust=, ?urn=, ?similar=, ?about, ?phase=.
import { aPrimary, aTrust, comparableSecondary, loadBuiltCore, schoolWithSimilar } from './support/data.ts';
import { expect, test } from './support/fixtures.ts';

test.describe('?trust=', () => {
  test('opens with only that trust’s schools, a chip, and the address kept', async ({ explorer, page }) => {
    const trust = aTrust('secondary');
    await explorer.open(`trust=${trust.id}`);
    await expect(page.locator('#focus').getByRole('button', { name: 'Clear trust filter' })).toBeVisible();
    await expect(page.locator('#focus')).toContainText('Schools on this map');
    expect(await explorer.dotCount()).toBeGreaterThan(0);
    expect(await explorer.dotCount()).toBeLessThanOrEqual(trust.schools.length);
    expect(explorer.query().get('trust')).toBe(trust.id);
  });

  test('a trust that matches nothing is ignored rather than leaving an empty map', async ({ explorer }) => {
    const total = loadBuiltCore('secondary').core.count;
    await explorer.open('trust=999999999');
    expect(await explorer.dotCount()).toBeGreaterThan(total * 0.7);
    await expect.poll(() => explorer.query().has('trust')).toBe(false);
  });

  test('works for primary schools too', async ({ explorer, page }) => {
    const trust = aTrust('primary');
    await explorer.open(`phase=primary&trust=${trust.id}`);
    await expect(page.locator('#focus').getByRole('button', { name: 'Clear trust filter' })).toBeVisible();
    expect(await explorer.dotCount()).toBeGreaterThan(0);
    expect(await explorer.dotCount()).toBeLessThanOrEqual(trust.schools.length);
  });
});

test.describe('?urn=', () => {
  test('opens that school’s popup, with its details loaded', async ({ explorer }) => {
    const [school] = comparableSecondary();
    await explorer.open(`urn=${school.urn}`);
    await expect(explorer.popup.getByRole('heading', { level: 3, name: school.name })).toBeVisible();
    await explorer.detailsLoaded();
    expect(explorer.query().get('urn')).toBe(String(school.urn));
  });

  test('a school hidden by the filters still opens (independent schools are off by default)', async ({ explorer }) => {
    const independent = loadBuiltCore('secondary').schools.find((s) => s.sector === 'independent')!;
    await explorer.open(`urn=${independent.urn}`);
    await expect(explorer.popup.getByRole('heading', { level: 3, name: independent.name })).toBeVisible();
  });

  test('an unknown URN opens the map without a popup', async ({ explorer }) => {
    await explorer.open('urn=1');
    await expect(explorer.popup).toHaveCount(0);
    expect(await explorer.dotCount()).toBeGreaterThan(3000);
  });

  test('a primary school’s link made before phases existed opens in the primary phase', async ({ explorer, page }) => {
    const primary = aPrimary();
    await page.goto(`/?urn=${primary.urn}`);
    await page.waitForURL(/phase=primary/);
    await explorer.ready();
    await expect(explorer.title).toHaveText('Primary schools in England');
    await expect(explorer.popup.getByRole('heading', { level: 3, name: primary.name })).toBeVisible();
    expect(explorer.query().get('urn')).toBe(String(primary.urn));
  });

  test('with ?phase=primary the school opens there directly', async ({ explorer }) => {
    const primary = aPrimary();
    await explorer.open(`phase=primary&urn=${primary.urn}`);
    await expect(explorer.popup.getByRole('heading', { level: 3, name: primary.name })).toBeVisible();
  });
});

test.describe('?similar=', () => {
  // Regression: the link has to fetch a school's details before the map is drawn, which once raced the style load
  // ("Source 'schools' already exists", and no dots). Any console error fails the test, so reaching the checks proves it.
  test('shows the school and its similar schools as dots, with no errors', async ({ explorer, page }) => {
    const { school, similar } = schoolWithSimilar();
    await explorer.open(`similar=${school.urn}`);
    await expect(page.locator('#focus').getByRole('button', { name: 'Clear similar to filter' })).toBeVisible();
    await expect(page.locator('#focus')).toContainText(school.name);
    // The dots are in the map and the legend counts them
    expect(await page.evaluate(() => !!window.__explorer!.map.getLayer('schools'))).toBe(true);
    const dots = await explorer.dotCount();
    expect(dots).toBeGreaterThan(1);
    expect(dots).toBeLessThanOrEqual(similar.length + 1);
    // The address keeps the short form, not the whole list
    expect(explorer.query().get('similar')).toBe(String(school.urn));
  });

  test('also works on the dark basemap (a second style load)', async ({ explorer, page }) => {
    const { school } = schoolWithSimilar();
    await page.emulateMedia({ colorScheme: 'dark' });
    await explorer.open(`similar=${school.urn}`);
    expect(await explorer.dotCount()).toBeGreaterThan(1);
    expect(await page.evaluate(() => !!window.__explorer!.map.getLayer('schools'))).toBe(true);
  });

  test('is reachable from a popup, and the chip clears it', async ({ explorer, page }) => {
    const { school } = schoolWithSimilar();
    await explorer.open(`urn=${school.urn}`);
    await explorer.detailsLoaded();
    // The group is folded by default
    await explorer.popupGroup(/^Similar schools$/i).locator(':scope > summary').click();
    await explorer.popup.getByRole('button', { name: /^See the \d+ similar schools on the map$/ }).click();
    const chip = page.locator('#focus').getByRole('button', { name: 'Clear similar to filter' });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(chip).toHaveCount(0);
    await expect.poll(() => explorer.query().has('similar')).toBe(false);
  });
});

test.describe('?about', () => {
  test('opens the About dialog, and closing it takes ?about out of the address', async ({ explorer, page }) => {
    await explorer.open('about');
    const dialog = page.getByRole('dialog', { name: 'About this map' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/OpenFreeMap/);
    await expect(dialog).toContainText(/privacy/i);
    await dialog.getByRole('button', { name: /close/i }).first().click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => explorer.query().has('about')).toBe(false);
  });

  test('the About button opens it and Escape closes it', async ({ explorer, page }) => {
    await explorer.open();
    await page.getByRole('button', { name: /About$/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'About this map' });
    await expect(dialog).toBeVisible();
    expect(explorer.query().has('about')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('?phase=', () => {
  test('?phase=secondary is the same as the bare address, and an unknown phase falls back to secondary', async ({ explorer }) => {
    await explorer.open('phase=secondary');
    await expect(explorer.title).toHaveText('Secondary schools in England');
    await explorer.open('phase=nonsense');
    await expect(explorer.title).toHaveText('Secondary schools in England');
  });
});
