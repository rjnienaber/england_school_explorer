// The school popup: opened from the map, from a link and from the list; its groups; the lazily loaded detail.
import { aPrimary, comparablePrimary, comparableSecondary, loadBuiltCore } from './support/data.ts';
import { expect, test } from './support/fixtures.ts';

const [school, other] = comparableSecondary();

test.describe('secondary', () => {
  test('clicking a dot opens the popup with the school’s basics and collapsible groups', async ({ explorer }) => {
    await explorer.open();
    await explorer.clickDot(school);
    await explorer.detailsLoaded();

    await expect(explorer.popup.getByRole('heading', { level: 3, name: school.name })).toBeVisible();
    // The address now names the school
    expect(explorer.query().get('urn')).toBe(String(school.urn));
    // Basics: type, place, tags
    await expect(explorer.popup.locator('p.meta').first()).toContainText(/·|ages/);
    await expect(explorer.popup.locator('.tags')).toBeVisible();

    // Groups are real <details> with a summary each; several are present and the first (results) is open
    const groups = explorer.popup.locator('details.popup-group');
    expect(await groups.count()).toBeGreaterThanOrEqual(5);
    await expect(groups.first()).toHaveJSProperty('open', true);
    await expect(explorer.popupGroup(/^Results$/i)).toBeVisible();
    await expect(explorer.popup).toContainText(/Ofsted/i);

    // A group folds and unfolds with the keyboard-friendly summary
    const summary = groups.first().locator(':scope > summary');
    await summary.click();
    await expect(groups.first()).toHaveJSProperty('open', false);
    await summary.click();
    await expect(groups.first()).toHaveJSProperty('open', true);
  });

  test('clicking a second dot with a popup open opens that school’s popup at once', async ({ explorer }) => {
    await explorer.open();
    await explorer.clickDot(school);
    await explorer.detailsLoaded();
    await explorer.clickDot(other);
    await explorer.detailsLoaded();
    await expect(explorer.popup).toHaveCount(1);
    await expect(explorer.popup.getByRole('heading', { level: 3, name: other.name })).toBeVisible();
  });

  test('clicking empty map closes the popup, but clicking the open school’s own dot keeps it', async ({ explorer, page }) => {
    await explorer.open();
    await explorer.clickDot(school);
    await explorer.detailsLoaded();
    // Its own dot again: still open
    const point = await page.evaluate(({ lng, lat }) => {
      const { x, y } = window.__explorer!.map.project([lng, lat]);
      const box = window.__explorer!.map.getCanvas().getBoundingClientRect();
      return { x: box.left + x, y: box.top + y };
    }, school);
    await page.mouse.click(point.x, point.y);
    await expect(explorer.popup).toBeVisible();
    // Empty map (the isolated school has nothing within 400 m, so 150 px at zoom 14 away is clear)
    await page.mouse.click(point.x, point.y + 150);
    await expect(explorer.popup).toHaveCount(0);
    expect(explorer.query().get('urn')).toBeNull();
  });

  test('the popup shows at once and the lazy detail fills in when it arrives', async ({ explorer }) => {
    const release = await explorer.holdDetails();
    await explorer.open();
    await explorer.clickDot(school);
    // Core fields only: the name and a "Loading…" note stand in for the rest
    await expect(explorer.popup.getByRole('heading', { level: 3, name: school.name })).toBeVisible();
    await expect(explorer.popup.locator('.loading-note')).toHaveText('Loading…');
    await expect(explorer.popup.locator('details.popup-group')).toHaveCount(0);

    release();
    await explorer.detailsLoaded();
    await expect(explorer.popup.locator('details.popup-group').first()).toBeVisible();
    await expect(explorer.popup).toContainText(/Progress 8/i);
  });

  test('a failed detail download says so instead of showing nothing', async ({ explorer, page, problems }) => {
    await page.route('**/data/details/*.json*', (route) => route.fulfill({ status: 500, body: 'no' }));
    await explorer.open();
    await explorer.clickDot(school);
    await expect(explorer.popup.getByText('Couldn’t load the rest of the details.')).toBeVisible();
    // The page reported it, as it should; this test expects exactly that and nothing else
    expect(problems.every((p) => p.startsWith('console.error:'))).toBe(true);
    expect(problems.length).toBeGreaterThan(0);
    problems.length = 0;
  });

  test('closing the popup takes the school out of the address', async ({ explorer, page }) => {
    await explorer.open();
    await explorer.clickDot(school);
    // Clicking an empty part of the map closes it (the stubbed basemap is blank there, and zoom 14 has no other dot nearby)
    const box = (await page.locator('#map canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
    await expect(explorer.popup).toHaveCount(0);
    await expect.poll(() => explorer.query().has('urn')).toBe(false);
  });

  test('opening a second school replaces the first popup, and the groups keep their open or closed state', async ({ explorer }) => {
    await explorer.open();
    await explorer.clickDot(school);
    await explorer.detailsLoaded();
    const first = explorer.popup.locator('details.popup-group').first();
    const name = await first.locator(':scope > summary').innerText();
    await first.locator(':scope > summary').click();
    await expect(first).toHaveJSProperty('open', false);

    await explorer.clickDot(other);
    await explorer.detailsLoaded();
    await expect(explorer.popup.getByRole('heading', { level: 3, name: other.name })).toBeVisible();
    await expect(explorer.page.locator('.maplibregl-popup')).toHaveCount(1);
    const again = explorer.popupGroup(name);
    await expect(again).toHaveJSProperty('open', false);
  });

  test('searching by name and choosing a result opens the popup', async ({ explorer, page }) => {
    await explorer.open();
    await page.getByRole('searchbox', { name: 'Search for a school or postcode' }).fill(school.name);
    await page.getByRole('option', { name: new RegExp(`^${school.name}`) }).first().click();
    await expect(explorer.popup).toBeVisible();
    await expect.poll(() => explorer.query().has('urn')).toBe(true);
  });

  test('a postcode search moves the map, using the stubbed lookup', async ({ explorer, page }) => {
    await explorer.open();
    const search = page.getByRole('searchbox', { name: 'Search for a school or postcode' });
    await search.fill('B1 1AA');
    await search.press('Enter');
    await expect(page.locator('.maplibregl-marker')).toBeVisible();
    await expect(page.locator('#search-status')).toHaveText('');
  });
});

test.describe('primary', () => {
  test('clicking a dot opens a primary popup with KS2 results and Ofsted', async ({ explorer }) => {
    const primary = aPrimary();
    await explorer.open('phase=primary');
    await explorer.clickDot(primary);
    await explorer.detailsLoaded();
    await expect(explorer.popup.getByRole('heading', { level: 3, name: primary.name })).toBeVisible();
    expect(explorer.query().get('phase')).toBe('primary');
    expect(await explorer.popup.locator('details.popup-group').count()).toBeGreaterThanOrEqual(3);
    await expect(explorer.popup).toContainText(/KS2/);
    // No secondary-only wording
    await expect(explorer.popup).not.toContainText(/Progress 8|Attainment 8/);
  });

  test('clicking a second dot with a popup open opens that school’s popup at once', async ({ explorer }) => {
    const [first, second] = comparablePrimary();
    await explorer.open('phase=primary');
    await explorer.clickDot(first);
    await explorer.detailsLoaded();
    await explorer.clickDot(second);
    await explorer.detailsLoaded();
    await expect(explorer.popup.getByRole('heading', { level: 3, name: second.name })).toBeVisible();
  });

  test('every popup piece loads for a spread of primary schools', async ({ explorer }) => {
    await explorer.open('phase=primary');
    const { schools } = loadBuiltCore('primary');
    for (const urn of [schools[10].urn, schools[8000].urn]) {
      await explorer.page.goto(`/?phase=primary&urn=${urn}`);
      await explorer.ready();
      await explorer.detailsLoaded();
    }
  });
});
