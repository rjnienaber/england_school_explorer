// Dark mode and the phone layout: the page works, and never scrolls sideways.
import { comparableSecondary } from './support/data.ts';
import { expect, test } from './support/fixtures.ts';

const [school] = comparableSecondary();

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('loads with the dark map style and readable controls', async ({ explorer, page, styleRequests }) => {
    await explorer.open();
    expect(styleRequests.some((u) => u.includes('/styles/dark'))).toBe(true);
    await expect(explorer.panel).toBeVisible();
    await expect(explorer.legend.locator('li').first()).toBeVisible();
    // The page background is dark, not the light theme's white
    const bg = await page.locator('#panel').evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeLessThan(300);
    expect(await explorer.horizontalScroll).toBe(false);
  });

  test('a popup works in dark mode', async ({ explorer }) => {
    await explorer.open();
    await explorer.clickDot(school);
    await explorer.detailsLoaded();
    await expect(explorer.popup).toContainText(school.name);
  });
});

test('switching the system theme while open redraws the dots on the other style', async ({ explorer, page, styleRequests }) => {
  await explorer.open();
  const before = await explorer.dotCount();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => styleRequests.some((u) => u.includes('/styles/dark'))).toBe(true);
  await expect.poll(() => page.evaluate(() => !!window.__explorer!.map.getLayer('schools'))).toBe(true);
  await expect.poll(() => explorer.dotCount()).toBe(before);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => explorer.dotCount()).toBe(before);
});

test.describe('on a phone (390 px wide)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the page loads without scrolling sideways, and the panel folds away', async ({ explorer, page }) => {
    await explorer.open();
    expect(await explorer.horizontalScroll).toBe(false);

    // The panel starts folded to a bar at the bottom, so the map is what you see; the bar opens it
    const toggle = page.locator('#panel-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(explorer.legend.locator('li').first()).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(explorer.legend.locator('li').first()).toBeVisible();
    expect(await explorer.horizontalScroll).toBe(false);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(explorer.legend.locator('li').first()).toBeHidden();
  });

  test('a popup fits inside the screen', async ({ explorer }) => {
    await explorer.open();
    await explorer.clickDot(school);
    await explorer.detailsLoaded();
    const box = (await explorer.popup.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);
    expect(await explorer.horizontalScroll).toBe(false);
  });

  test('the primary phase also fits', async ({ explorer }) => {
    await explorer.open('phase=primary');
    expect(await explorer.horizontalScroll).toBe(false);
  });
});
